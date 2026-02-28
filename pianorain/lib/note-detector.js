// lib/note-detector.js — Pitch detection and MIDI conversion for PianoRain
//
// Essentia.js WASM is loaded at runtime via the vendor/ bundle.
// Until the WASM module is available, a lightweight FFT-based peak-picking
// fallback is used so the extension works out of the box.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Piano range: MIDI 21 (A0) — 108 (C8)
const MIDI_MIN = 21;
const MIDI_MAX = 108;

// Noise gate: minimum amplitude in dB for a frequency bin to be considered
const AMPLITUDE_THRESHOLD_DB = -50;

/**
 * Converts a frequency (Hz) to a MIDI note number.
 * @param {number} freq
 * @returns {number}
 */
function freqToMidi(freq) {
  if (freq <= 0) return -1;
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

/**
 * Converts a MIDI note number to a human-readable note name (e.g. 60 → "C4").
 * @param {number} midi
 * @returns {string}
 */
function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

/**
 * Returns true if the given MIDI note is a black key.
 * @param {number} midiNote
 * @returns {boolean}
 */
function isBlackKey(midiNote) {
  return NOTE_NAMES[midiNote % 12].includes('#');
}

/**
 * Detects the predominant pitch from FFT frequency data using peak-picking.
 * Returns a MIDI note number within the piano range, or -1 if no note detected.
 *
 * @param {Float32Array} freqData  - output of AnalyserNode.getFloatFrequencyData (dB)
 * @param {number} sampleRate
 * @returns {number} MIDI note number or -1
 */
function detectNote(freqData, sampleRate) {
  const binCount = freqData.length;
  const binHz = sampleRate / (binCount * 2);

  // Piano frequency range
  const freqMin = midiToFreq(MIDI_MIN);
  const freqMax = midiToFreq(MIDI_MAX);

  const binStart = Math.max(0, Math.floor(freqMin / binHz));
  const binEnd = Math.min(binCount - 1, Math.ceil(freqMax / binHz));

  // Find the peak bin within the piano frequency range, above the noise gate
  let peakAmplitude = AMPLITUDE_THRESHOLD_DB;
  let peakBin = -1;

  for (let i = binStart; i <= binEnd; i++) {
    if (freqData[i] > peakAmplitude) {
      peakAmplitude = freqData[i];
      peakBin = i;
    }
  }

  if (peakBin < 0) return -1;

  // Sub-bin interpolation (parabolic) for better frequency accuracy
  let peakFreq = peakBin * binHz;
  if (peakBin > 0 && peakBin < binCount - 1) {
    const alpha = freqData[peakBin - 1];
    const beta = freqData[peakBin];
    const gamma = freqData[peakBin + 1];
    const denom = alpha - 2 * beta + gamma;
    if (denom !== 0) {
      const offset = 0.5 * (alpha - gamma) / denom;
      peakFreq = (peakBin + offset) * binHz;
    }
  }

  const midi = freqToMidi(peakFreq);
  if (midi < MIDI_MIN || midi > MIDI_MAX) return -1;
  return midi;
}

/**
 * Converts a MIDI note number to its fundamental frequency (Hz).
 * @param {number} midi
 * @returns {number}
 */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Essentia.js WASM integration (optional enhancement)
// When the WASM module is available, it replaces the peak-picking detector.
let essentiaInstance = null;

/**
 * Attempts to load the Essentia.js WASM module.
 * Call once during initialisation.  Safe to call even if the module is absent.
 * @param {string} wasmUrl  - chrome.runtime.getURL('vendor/essentia/essentia-wasm.module.js')
 */
async function loadEssentia(wasmUrl) {
  try {
    // Dynamic import only works for module scripts; use importScripts in workers.
    // Here we inject a <script> tag and wait for EssentiaWASM to appear on window.
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = wasmUrl;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    if (typeof window.EssentiaWASM === 'function') {
      const module = await window.EssentiaWASM();
      essentiaInstance = new window.Essentia(module);
      console.log('[PianoRain] Essentia.js WASM loaded successfully');
    }
  } catch (e) {
    console.warn('[PianoRain] Essentia.js WASM not available, using fallback detector:', e.message);
  }
}

/**
 * Detects the predominant pitch using Essentia.js PitchYinFFT when available,
 * falling back to the built-in peak-picker.
 *
 * @param {Float32Array} freqData  - dB values from AnalyserNode.getFloatFrequencyData
 * @param {Float32Array} timeData  - linear values from AnalyserNode.getFloatTimeDomainData
 * @param {number} sampleRate
 * @returns {number} MIDI note or -1
 */
function detectNoteEnhanced(freqData, timeData, sampleRate) {
  if (essentiaInstance) {
    try {
      // PitchYinFFT expects a power spectrum (linear amplitude), not dB
      const spectrumSize = freqData.length;
      const essentiaVec = essentiaInstance.arrayToVector(timeData);
      const result = essentiaInstance.PitchYinFFT(essentiaVec, spectrumSize, sampleRate);
      const freq = result.pitch;
      const confidence = result.pitchConfidence;

      if (confidence > 0.5 && freq > 0) {
        const midi = freqToMidi(freq);
        if (midi >= MIDI_MIN && midi <= MIDI_MAX) return midi;
      }
      return -1;
    } catch (e) {
      // Fall back to peak-picking on error
    }
  }
  return detectNote(freqData, sampleRate);
}
