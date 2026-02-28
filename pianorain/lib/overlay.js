// lib/overlay.js — Creates, positions, and resizes the canvas overlay on YouTube

const OVERLAY_ID = 'pianorain-overlay';

/**
 * Creates or retrieves the canvas overlay positioned over YouTube's #movie_player.
 * @returns {HTMLCanvasElement|null}
 */
function createOverlay() {
  // Remove existing overlay if any
  removeOverlay();

  const player = document.querySelector('#movie_player');
  if (!player) return null;

  const canvas = document.createElement('canvas');
  canvas.id = OVERLAY_ID;

  Object.assign(canvas.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '100',
  });

  // Make sure the player container allows absolute positioning
  const playerStyle = window.getComputedStyle(player);
  if (playerStyle.position === 'static') {
    player.style.position = 'relative';
  }

  player.appendChild(canvas);
  resizeCanvas(canvas, player);
  return canvas;
}

/**
 * Resizes the canvas to match the player's current pixel dimensions.
 * @param {HTMLCanvasElement} canvas
 * @param {Element} [player]
 */
function resizeCanvas(canvas, player) {
  const container = player || document.querySelector('#movie_player');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width || container.clientWidth;
  canvas.height = rect.height || container.clientHeight;
}

/**
 * Removes the canvas overlay from the DOM.
 */
function removeOverlay() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();
}

/**
 * Attaches resize and fullscreen listeners that keep the canvas sized correctly.
 * Returns a cleanup function to detach the listeners.
 * @param {HTMLCanvasElement} canvas
 * @returns {Function} cleanup
 */
function attachResizeListeners(canvas) {
  function onResize() {
    resizeCanvas(canvas);
  }

  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onResize);

  return function cleanup() {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('fullscreenchange', onResize);
  };
}
