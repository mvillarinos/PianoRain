// lib/audio-capture.js — Web Audio API setup for PianoRain

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let capturedVideo = null; // track which video element is captured

/**
 * Initialises the Web Audio pipeline for a given <video> element.
 * Creates: AudioContext → MediaElementSource → AnalyserNode → destination
 *
 * Note: createMediaElementSource can only be called once per video element
 * in a given AudioContext. If the same video is passed again we reuse the
 * existing nodes; if a different video is passed we tear down first.
 *
 * @param {HTMLVideoElement} video
 * @returns {{ audioCtx: AudioContext, analyser: AnalyserNode }}
 */
function initAudioCapture(video) {
  if (audioCtx && capturedVideo === video) {
    // Reuse existing pipeline for the same video element
    return { audioCtx, analyser };
  }

  teardownAudioCapture();

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;

  sourceNode = audioCtx.createMediaElementSource(video);
  capturedVideo = video;

  // Route: source → analyser → destination (user still hears audio)
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  return { audioCtx, analyser };
}

/**
 * Disconnects all audio nodes and closes the AudioContext.
 */
function teardownAudioCapture() {
  try {
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }
    if (analyser) {
      analyser.disconnect();
      analyser = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    capturedVideo = null;
  } catch (e) {
    // Ignore errors during teardown
  }
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
