// lib/midi-export.js — MIDI file export for PianoRain
// Implements SMF (Standard MIDI File) Type 0 generation and offline video processing.
// Depends on detectNoteEnhanced() from lib/note-detector.js (loaded as a prior content script).

// Playback rate used during offline export: fast enough to process quickly,
// while still allowing audio decoding and AnalyserNode sampling to work.
const EXPORT_PLAYBACK_RATE = 16;

// Wall-clock interval (ms) between pitch detection samples during export.
// At 16x speed, each 100ms ≈ 1.6 s of video time.
const DETECTION_INTERVAL_MS = 100;

/**
 * Encodes an integer as a MIDI Variable Length Quantity (VLQ).
 * @param {number} value  Non-negative integer
 * @returns {number[]}
 */
function writeVLQ(value) {
  const bytes = [];
  bytes.push(value & 0x7F);
  value >>>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  return bytes;
}

/**
 * Builds a Standard MIDI File (Type 0, single track) from an array of note events.
 *
 * @param {Array<{midi: number, startTime: number, endTime: number}>} notes
 *   Each note has a MIDI note number and start/end times in seconds.
 * @returns {Uint8Array}  Complete .mid file bytes
 */
function buildMidiFile(notes) {
  const TICKS_PER_QUARTER = 480;
  const BPM = 120;
  const TICKS_PER_SECOND = TICKS_PER_QUARTER * BPM / 60; // 960
  const MAX_DELTA = 0x0FFFFFFF;

  // Convert note events to MIDI events sorted by time
  const midiEvents = [];

  for (const note of notes) {
    if (note.endTime <= note.startTime) continue;
    const midiNote = note.midi & 0x7F;
    midiEvents.push({ time: note.startTime, type: 0x90, note: midiNote, velocity: 80 });
    midiEvents.push({ time: note.endTime,   type: 0x80, note: midiNote, velocity: 0 });
  }

  // Sort by time, note-off before note-on at the same time
  midiEvents.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.type - b.type; // 0x80 (note-off) < 0x90 (note-on)
  });

  // Build track chunk bytes
  const trackBytes = [];

  // Track Name meta event: delta=0, FF 03 <len> "PianoRain Export"
  const trackName = 'PianoRain Export';
  const nameBytes = [];
  for (let i = 0; i < trackName.length; i++) {
    nameBytes.push(trackName.charCodeAt(i));
  }
  trackBytes.push(...writeVLQ(0), 0xFF, 0x03, ...writeVLQ(nameBytes.length), ...nameBytes);

  // Time Signature meta event: delta=0, FF 58 04 04 02 18 08 (4/4 time)
  trackBytes.push(...writeVLQ(0), 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

  // Tempo meta event: delta=0, FF 51 03 <3-byte microseconds per quarter note>
  const usPerBeat = Math.round(60000000 / BPM); // 500000 for 120 BPM
  trackBytes.push(...writeVLQ(0), 0xFF, 0x51, 0x03,
    (usPerBeat >> 16) & 0xFF,
    (usPerBeat >> 8)  & 0xFF,
     usPerBeat        & 0xFF);

  // Program Change: delta=0, C0 00 (Acoustic Grand Piano on channel 0)
  trackBytes.push(...writeVLQ(0), 0xC0, 0x00);

  // Note events
  let prevTick = 0;
  for (const ev of midiEvents) {
    const tick = Math.max(0, Math.round(ev.time * TICKS_PER_SECOND));
    const delta = Math.min(MAX_DELTA, Math.max(0, tick - prevTick));
    prevTick = tick;
    trackBytes.push(...writeVLQ(delta), ev.type, ev.note & 0x7F, ev.velocity & 0x7F);
  }

  // End-of-track meta event
  trackBytes.push(...writeVLQ(0), 0xFF, 0x2F, 0x00);

  // Header chunk: MThd, length=6, format=0, tracks=1, ticks/quarter
  const header = [
    0x4D, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // chunk length = 6
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    (TICKS_PER_QUARTER >> 8) & 0xFF,
     TICKS_PER_QUARTER       & 0xFF,
  ];

  // Track chunk: MTrk + 4-byte length + data
  const trackLen = trackBytes.length;
  const track = [
    0x4D, 0x54, 0x72, 0x6B, // "MTrk"
    (trackLen >> 24) & 0xFF,
    (trackLen >> 16) & 0xFF,
    (trackLen >> 8)  & 0xFF,
     trackLen        & 0xFF,
    ...trackBytes,
  ];

  return new Uint8Array([...header, ...track]);
}

/**
 * Triggers a browser download of a MIDI file.
 * @param {Uint8Array} midiData
 * @param {string} filename
 */
function downloadMidiFile(midiData, filename) {
  const blob = new Blob([midiData], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Performs an offline processing pass of the entire video to detect notes,
 * then builds and returns a MIDI file as a Uint8Array.
 *
 * @param {HTMLVideoElement} video
 * @param {AnalyserNode} analyser
 * @param {AudioContext} audioCtx
 * @param {function(number): void} [onProgress]  Called with progress 0–1
 * @returns {Promise<Uint8Array>}
 */
function exportVideoToMidi(video, analyser, audioCtx, onProgress) {
  return new Promise((resolve, reject) => {
    // Save original state
    const origTime = video.currentTime;
    const origRate = video.playbackRate;
    const origMuted = video.muted;
    const origPaused = video.paused;

    const notes = [];
    let currentNote = -1;
    let noteStartTime = 0;
    let intervalId = null;
    let cancelled = false;

    function restore() {
      video.muted = origMuted;
      video.playbackRate = origRate;
      if (origPaused) {
        video.pause();
      }
      video.currentTime = origTime;
    }

    function finish() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // Close any open note
      if (currentNote !== -1) {
        notes.push({ midi: currentNote, startTime: noteStartTime, endTime: video.currentTime });
        currentNote = -1;
      }
      restore();
      const midiData = buildMidiFile(notes);
      resolve(midiData);
    }

    function abort(err) {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      restore();
      reject(err);
    }

    function tick() {
      if (cancelled) {
        abort(new Error('Export cancelled'));
        return;
      }

      const duration = video.duration;
      const currentTime = video.currentTime;

      // Report progress
      if (typeof onProgress === 'function' && duration > 0) {
        onProgress(Math.min(currentTime / duration, 1));
      }

      // Detect note
      const freqData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freqData);
      const timeData = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(timeData);
      const sr = audioCtx.sampleRate;

      const midi = detectNoteEnhanced(freqData, timeData, sr);

      if (midi !== currentNote) {
        // End previous note
        if (currentNote !== -1) {
          notes.push({ midi: currentNote, startTime: noteStartTime, endTime: currentTime });
        }
        // Start new note (or silence)
        currentNote = midi !== -1 ? midi : -1;
        if (currentNote !== -1) {
          noteStartTime = currentTime;
        }
      }

      // Check if finished
      if (video.ended || (duration > 0 && currentTime >= duration)) {
        finish();
      }
    }

    // Start the offline pass
    video.muted = true;
    video.playbackRate = EXPORT_PLAYBACK_RATE;

    function startProcessing() {
      video.play().catch((e) => abort(e));
      intervalId = setInterval(tick, DETECTION_INTERVAL_MS);
    }

    video.addEventListener('seeked', startProcessing, { once: true });
    video.addEventListener('error', (e) => abort(new Error('Video error during export')), { once: true });

    video.currentTime = 0;
  });
}
