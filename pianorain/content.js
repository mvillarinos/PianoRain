// content.js — PianoRain main content script
// Orchestrates: audio capture → note detection → overlay rendering
// All lib/*.js files are loaded as content scripts before this file and share
// the same content script global scope.

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let isActive = false;
  let canvas = null;
  let ctx = null;
  let animFrameId = null;
  let cleanupOverlayListeners = null;
  let cleanupVideoSync = null;
  let video = null;
  let noteColor = '#00BFFF';
  let playbackRate = 1;
  let lastFrameTime = null;

  // References to the audio nodes (set during activate)
  let analyser = null;
  let audioCtx = null;

  // ── Initialise PianoRain ───────────────────────────────────────────────────
  async function activate(color) {
    if (isActive) return { ok: true };
    noteColor = color || noteColor;

    video = document.querySelector('video');
    if (!video) {
      sendStatus('error', 'No video element found on this page.');
      return { error: 'No video element found on this page.' };
    }

    // Initialise Web Audio API
    try {
      const capture = initAudioCapture(video);
      audioCtx = capture.audioCtx;
      analyser = capture.analyser;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
    } catch (e) {
      sendStatus('error', 'Audio capture failed: ' + e.message);
      return { error: 'Audio capture failed: ' + e.message };
    }

    // Create canvas overlay
    canvas = createOverlay();
    if (!canvas) {
      sendStatus('error', 'Could not find YouTube player element (#movie_player).');
      return { error: 'Could not find YouTube player element.' };
    }
    ctx = canvas.getContext('2d');

    // Resize listeners
    cleanupOverlayListeners = attachResizeListeners(canvas);

    // Video sync listeners
    cleanupVideoSync = attachVideoSync(video, {
      onPlay: () => { /* animation loop checks video.paused each frame */ },
      onPause: () => { /* animation loop checks video.paused each frame */ },
      onSeeked: () => { clearAllNotes(); },
      onRateChange: (rate) => { playbackRate = rate; },
    });

    playbackRate = video.playbackRate;
    isActive = true;
    lastFrameTime = null;
    clearAllNotes();
    startRenderLoop();

    // Attempt to load Essentia.js WASM for better pitch accuracy
    const wasmUrl = chrome.runtime.getURL('vendor/essentia/essentia-wasm.web.js');
    loadEssentia(wasmUrl).catch(() => {});

    sendStatus('active');
    return { ok: true };
  }

  // ── Deactivate ─────────────────────────────────────────────────────────────
  function deactivate() {
    if (!isActive) return;
    isActive = false;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (cleanupOverlayListeners) {
      cleanupOverlayListeners();
      cleanupOverlayListeners = null;
    }
    if (cleanupVideoSync) {
      cleanupVideoSync();
      cleanupVideoSync = null;
    }

    removeOverlay();
    teardownAudioCapture();
    clearAllNotes();

    canvas = null;
    ctx = null;
    video = null;
    analyser = null;
    audioCtx = null;
    lastFrameTime = null;

    sendStatus('inactive');
  }

  // ── Render loop ────────────────────────────────────────────────────────────
  function startRenderLoop() {
    function frame(timestamp) {
      if (!isActive) return;
      animFrameId = requestAnimationFrame(frame);

      if (!canvas || !ctx) return;

      if (video.paused || video.ended) {
        renderFrame();
        lastFrameTime = null;
        return;
      }

      const dt = lastFrameTime !== null
        ? Math.min((timestamp - lastFrameTime) / 1000, 0.1)
        : 0;
      lastFrameTime = timestamp;

      // Get frequency & time domain data
      const freqData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freqData);

      const timeData = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(timeData);

      const sr = audioCtx ? audioCtx.sampleRate : 44100;

      // Detect note
      const midi = detectNoteEnhanced(freqData, timeData, sr);

      // Update falling notes
      updateNotes(midi, canvas.width, canvas.height, noteColor, playbackRate, getKeyPosition);
      advanceNotes(dt, canvas.height, playbackRate, getKeyboardTop);

      renderFrame();
    }

    animFrameId = requestAnimationFrame(frame);
  }

  function renderFrame() {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const activeKeys = getActiveKeyMidis(h);
    renderNotes(ctx, h, noteColor);
    renderPiano(ctx, w, h, activeKeys, noteColor);
  }

  // ── Status helper ──────────────────────────────────────────────────────────
  function sendStatus(state, message) {
    chrome.runtime.sendMessage({
      target: 'popup',
      type: 'status',
      state,
      message,
    }).catch(() => {
      // Ignore — popup may be closed or not listening
    });
  }

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.target !== 'content') return;

    switch (message.type) {
      case 'activate':
        activate(message.noteColor).then(sendResponse);
        return true; // async

      case 'deactivate':
        deactivate();
        sendResponse({ ok: true });
        break;

      case 'updateColor':
        noteColor = message.noteColor;
        updateNoteColors(noteColor);
        sendResponse({ ok: true });
        break;

      case 'exportMidi':
        handleExportMidi().then(sendResponse);
        return true; // async

      case 'ping':
        sendResponse({ ok: true });
        break;
    }
  });

  // ── Export MIDI ────────────────────────────────────────────────────────────
  async function handleExportMidi() {
    if (!isActive || !video || !analyser || !audioCtx) {
      return { error: 'PianoRain must be active to export MIDI.' };
    }
    try {
      sendStatus('exporting', 'Processing video...');
      const midiData = await exportVideoToMidi(video, analyser, audioCtx, (progress) => {
        chrome.runtime.sendMessage({
          target: 'popup',
          type: 'exportProgress',
          progress,
        }).catch(() => {});
      });

      // An empty-notes MIDI file contains only the header chunk (14 bytes) and a track chunk
      // with just the metadata events (Track Name, Time Signature, Tempo, Program Change,
      // End-of-Track) = 42 track bytes + 8 chunk header bytes = 50 bytes. Total = 64 bytes.
      // If the file is no larger than this, no note events were generated.
      const EMPTY_MIDI_SIZE = 64;
      if (midiData.length <= EMPTY_MIDI_SIZE) {
        sendStatus('active');
        return { error: 'No piano notes were detected in this video.' };
      }

      const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #info-contents h1');
      const title = titleEl
        ? titleEl.textContent.trim().replace(/[^\w\s-]/g, '').substring(0, 60)
        : 'pianorain-export';
      downloadMidiFile(midiData, `${title}.mid`);

      sendStatus('active');
      return { ok: true };
    } catch (e) {
      sendStatus('active');
      return { error: 'MIDI export failed: ' + e.message };
    }
  }

  // ── SPA navigation (YouTube navigates without full page reload) ────────────
  document.addEventListener('yt-navigate-finish', () => {
    if (isActive) {
      deactivate();
    }
    // Always reset stored active state on navigation so popup shows "Inactive"
    chrome.storage.local.set({ active: false });
  });

})();
