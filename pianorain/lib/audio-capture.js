// lib/audio-capture.js — Web Audio API setup for PianoRain

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let capturedVideo = null; // track which video element is captured

function createAnalyserNode() {
  const node = audioCtx.createAnalyser();
  node.fftSize = 8192;
  node.smoothingTimeConstant = 0.6;
  return node;
}

/**
 * Initialises the Web Audio pipeline for a given <video> element.
 * Creates: AudioContext → MediaElementSource → AnalyserNode → destination
 *
 * Note: createMediaElementSource can only be called once per video element.
 * If the same video is passed again we reuse the existing sourceNode and just
 * reconnect a fresh AnalyserNode. If a different video is passed we fully
 * tear down first.
 *
 * @param {HTMLVideoElement} video
 * @returns {{ audioCtx: AudioContext, analyser: AnalyserNode }}
 */
function initAudioCapture(video) {
  // Full reuse — same video, context still open
  if (audioCtx && capturedVideo === video && audioCtx.state !== 'closed') {
    // Reconnect nodes in case they were disconnected
    if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} }
    if (analyser) { try { analyser.disconnect(); } catch (_) {} }

    analyser = createAnalyserNode();

    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    return { audioCtx, analyser };
  }

  // Different video — full teardown needed
  if (capturedVideo && capturedVideo !== video) {
    destroyAudioCapture();
  }

  // Create new context only if needed
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  analyser = createAnalyserNode();

  // Only create source if we don't already have one for this video
  if (!sourceNode || capturedVideo !== video) {
    sourceNode = audioCtx.createMediaElementSource(video);
    capturedVideo = video;
  }

  // Route: source → analyser → destination (user still hears audio)
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  return { audioCtx, analyser };
}

/**
 * Disconnects audio nodes but keeps sourceNode, audioCtx, and capturedVideo
 * alive so the same video element can be reused without calling
 * createMediaElementSource() again (which the Web Audio API forbids).
 */
function teardownAudioCapture() {
  try {
    if (sourceNode) {
      sourceNode.disconnect();
      // Do NOT set sourceNode to null — it can be reused
    }
    if (analyser) {
      analyser.disconnect();
      analyser = null;
    }
    // Do NOT close audioCtx — it can be resumed later
    // Do NOT null capturedVideo — we need to remember which video is bound
  } catch (e) {
    // Ignore errors during teardown
  }
}

/**
 * Fully destroys all audio resources. Call this only when the video element
 * itself is changing (e.g., full page unload or a different video node).
 */
function destroyAudioCapture() {
  try {
    if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
    if (analyser) { analyser.disconnect(); analyser = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    capturedVideo = null;
  } catch (e) {}
}

/**
 * Returns the current AnalyserNode's float-domain frequency data (magnitude spectrum).
 * @returns {Float32Array|null}
 */
function getFrequencyData() {
  if (!analyser) return null;
  const data = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(data);
  return data;
}

/**
 * Returns the sample rate of the current AudioContext.
 * @returns {number}
 */
function getSampleRate() {
  return audioCtx ? audioCtx.sampleRate : 44100;
}
