// lib/falling-notes.js — Manages falling note blocks lifecycle

// Pixels per second at 1× playback speed (tuned for typical YouTube video heights ~400–720px)
const BASE_FALL_SPEED = 200;

// Pool of active falling notes
// Each entry: { midi, x, w, y, height, color, active (still being sustained), startTime }
let fallingNotes = [];

// Currently sustained note (a note that is still being detected)
let sustainedNote = null;

/**
 * Called each frame with a potentially detected MIDI note.
 * Handles spawn, sustain, and release of note blocks.
 *
 * @param {number|null} detectedMidi  - MIDI note from detector, or -1/null if silence
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {string} color
 * @param {number} playbackRate
 * @param {Function} getKeyPos  - (midi, w, h) → {x, w, black}
 */
function updateNotes(detectedMidi, canvasWidth, canvasHeight, color, playbackRate, getKeyPos) {
  const midi = (detectedMidi !== null && detectedMidi >= 0) ? detectedMidi : null;

  if (midi !== null) {
    if (sustainedNote && sustainedNote.midi === midi) {
      // Extend the sustained block
      sustainedNote.active = true;
    } else {
      // Release previous sustained note (if any)
      if (sustainedNote) {
        sustainedNote.active = false;
        sustainedNote = null;
      }
      // Spawn new block at the top of the canvas
      const keyPos = getKeyPos(midi, canvasWidth, canvasHeight);
      if (keyPos) {
        const newNote = {
          midi,
          x: keyPos.x,
          w: keyPos.w,
          y: 0,
          height: 0,
          color,
          active: true,
          black: keyPos.black,
        };
        fallingNotes.push(newNote);
        sustainedNote = newNote;
      }
    }
  } else {
    // Silence — release sustained note
    if (sustainedNote) {
      sustainedNote.active = false;
      sustainedNote = null;
    }
  }
}

/**
 * Advances all falling notes by `dt` seconds of video time.
 * Removes notes that have fallen below the canvas.
 *
 * @param {number} dt            - elapsed video time in seconds
 * @param {number} canvasHeight
 * @param {number} playbackRate
 * @param {Function} getKeyboardTop  - (canvasHeight) → number (y of keyboard top)
 */
function advanceNotes(dt, canvasHeight, playbackRate, getKeyboardTop) {
  const speed = BASE_FALL_SPEED * (playbackRate || 1);
  const kbTop = getKeyboardTop(canvasHeight);

  fallingNotes = fallingNotes.filter((note) => {
    if (note.active) {
      // The block is still being sustained — grow it downward (extend height)
      note.height += speed * dt;
    } else {
      // Released — the entire block falls
      note.y += speed * dt;
    }
    // Remove if entirely below the canvas
    return note.y < canvasHeight;
  });
}

/**
 * Returns the set of MIDI notes whose blocks are currently touching the keyboard.
 * @param {number} canvasHeight
 * @returns {Set<number>}
 */
function getActiveKeyMidis(canvasHeight) {
  const kbTop = getKeyboardTopLocal(canvasHeight);
  const active = new Set();
  for (const note of fallingNotes) {
    const bottom = note.y + note.height;
    if (bottom >= kbTop) active.add(note.midi);
  }
  return active;
}

function getKeyboardTopLocal(canvasHeight) {
  return canvasHeight - Math.round(canvasHeight * 0.14);
}

/**
 * Draws all falling note blocks onto the canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasHeight
 * @param {string} color   - current user color (overrides individual block colors)
 */
function renderNotes(ctx, canvasHeight, color) {
  const kbTop = getKeyboardTopLocal(canvasHeight);

  ctx.save();
  ctx.globalAlpha = 0.85;

  for (const note of fallingNotes) {
    const blockColor = color || note.color;
    const x = note.x;
    const y = note.y;
    const w = note.w - 2;
    // Clip height so the block doesn't render over the keyboard area
    const rawH = note.height;
    const visibleBottom = Math.min(y + rawH, kbTop);
    const h = visibleBottom - y;
    if (h <= 0) continue;

    // Glow effect
    ctx.shadowColor = blockColor;
    ctx.shadowBlur = 12;

    ctx.fillStyle = blockColor;
    ctx.fillRect(x + 1, y, w, h);
  }

  ctx.restore();
}

/**
 * Updates the color of all existing falling notes.
 * @param {string} newColor
 */
function updateNoteColors(newColor) {
  for (const note of fallingNotes) {
    note.color = newColor;
  }
}

/**
 * Removes all falling notes and resets sustained state.
 */
function clearAllNotes() {
  fallingNotes = [];
  sustainedNote = null;
}
