// lib/piano-renderer.js — Renders the virtual 88-key piano keyboard on canvas

// MIDI range for an 88-key piano
const PIANO_MIDI_MIN = 21; // A0
const PIANO_MIDI_MAX = 108; // C8
const TOTAL_KEYS = PIANO_MIDI_MAX - PIANO_MIDI_MIN + 1; // 88

const NOTE_NAMES_RENDERER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 52 white keys total on an 88-key piano
const TOTAL_WHITE_KEYS = 52;

/**
 * Returns true if a MIDI note corresponds to a black key.
 * @param {number} midi
 * @returns {boolean}
 */
function isBlackKeyRenderer(midi) {
  return NOTE_NAMES_RENDERER[midi % 12].includes('#');
}

/**
 * Pre-computes the x-position and width for every key (MIDI 21–108).
 * Returns an array indexed by (midi - PIANO_MIDI_MIN).
 *
 * @param {number} canvasWidth
 * @param {number} keyboardY   - top y of the keyboard area
 * @param {number} keyboardH   - height of the keyboard area
 * @returns {Array<{x:number, y:number, w:number, h:number, black:boolean, midi:number}>}
 */
function computeKeyLayout(canvasWidth, keyboardY, keyboardH) {
  const whiteW = canvasWidth / TOTAL_WHITE_KEYS;
  const blackW = whiteW * 0.6;
  const blackH = keyboardH * 0.62;

  const layout = [];
  let whiteIndex = 0;

  for (let midi = PIANO_MIDI_MIN; midi <= PIANO_MIDI_MAX; midi++) {
    if (!isBlackKeyRenderer(midi)) {
      layout.push({
        midi,
        black: false,
        x: whiteIndex * whiteW,
        y: keyboardY,
        w: whiteW,
        h: keyboardH,
      });
      whiteIndex++;
    } else {
      // Black key sits between the previous and next white keys
      const prevWhiteX = (whiteIndex - 1) * whiteW;
      layout.push({
        midi,
        black: true,
        x: prevWhiteX + whiteW - blackW / 2,
        y: keyboardY,
        w: blackW,
        h: blackH,
      });
    }
  }

  return layout;
}

/**
 * Renders the piano keyboard on the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {Set<number>} activeNotes   - MIDI notes currently lit up
 * @param {string} activeColor        - CSS color for lit keys
 */
function renderPiano(ctx, canvasWidth, canvasHeight, activeNotes, activeColor) {
  const keyboardH = Math.round(canvasHeight * 0.14);
  const keyboardY = canvasHeight - keyboardH;

  // Semi-transparent dark background for readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, keyboardY, canvasWidth, keyboardH);

  const layout = computeKeyLayout(canvasWidth, keyboardY, keyboardH);

  // Draw white keys first
  for (const key of layout) {
    if (key.black) continue;
    const isActive = activeNotes.has(key.midi);
    ctx.fillStyle = isActive ? activeColor : '#f0f0f0';
    ctx.fillRect(key.x + 1, key.y + 1, key.w - 2, key.h - 2);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(key.x + 1, key.y + 1, key.w - 2, key.h - 2);

    if (isActive) {
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 8;
      ctx.fillRect(key.x + 1, key.y + 1, key.w - 2, key.h - 2);
      ctx.shadowBlur = 0;
    }
  }

  // Draw black keys on top
  for (const key of layout) {
    if (!key.black) continue;
    const isActive = activeNotes.has(key.midi);
    ctx.fillStyle = isActive ? activeColor : '#1a1a1a';
    ctx.fillRect(key.x, key.y, key.w, key.h);

    if (isActive) {
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 10;
      ctx.fillRect(key.x, key.y, key.w, key.h);
      ctx.shadowBlur = 0;
    }
  }

  return layout;
}

/**
 * Given a MIDI note, returns the {x, w} position within the keyboard layout.
 * @param {number} midi
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{x:number, w:number}|null}
 */
function getKeyPosition(midi, canvasWidth, canvasHeight) {
  if (midi < PIANO_MIDI_MIN || midi > PIANO_MIDI_MAX) return null;
  const keyboardH = Math.round(canvasHeight * 0.14);
  const keyboardY = canvasHeight - keyboardH;
  const layout = computeKeyLayout(canvasWidth, keyboardY, keyboardH);
  const key = layout[midi - PIANO_MIDI_MIN];
  if (!key) return null;
  return { x: key.x, w: key.w, black: key.black };
}

/**
 * Returns the y-coordinate of the top of the keyboard area.
 * @param {number} canvasHeight
 * @returns {number}
 */
function getKeyboardTop(canvasHeight) {
  return canvasHeight - Math.round(canvasHeight * 0.14);
}
