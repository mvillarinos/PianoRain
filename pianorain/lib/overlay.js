// lib/overlay.js — Creates, positions, and resizes the canvas overlay on YouTube

const OVERLAY_ID = 'pianorain-overlay';
const CONTAINER_ID = 'pianorain-container';
const HANDLE_ID = 'pianorain-handle';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;
const DEFAULT_WIDTH_RATIO = 0.30;
const DEFAULT_HEIGHT_RATIO = 0.40;
const MARGIN = 8;

/**
 * Creates or retrieves the canvas overlay positioned over YouTube's #movie_player.
 * The overlay is a floating resizable widget anchored to the top-right corner.
 * @returns {HTMLCanvasElement|null}
 */
function createOverlay() {
  removeOverlay();

  const player = document.querySelector('#movie_player');
  if (!player) return null;

  // Make sure the player container allows absolute positioning
  const playerStyle = window.getComputedStyle(player);
  if (playerStyle.position === 'static') {
    player.style.position = 'relative';
  }

  const playerW = player.clientWidth;
  const playerH = player.clientHeight;
  const defaultW = Math.max(MIN_WIDTH, Math.round(playerW * DEFAULT_WIDTH_RATIO));
  const defaultH = Math.max(MIN_HEIGHT, Math.round(playerH * DEFAULT_HEIGHT_RATIO));

  // Outer container — handles positioning, background and border styling
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  Object.assign(container.style, {
    position: 'absolute',
    top: MARGIN + 'px',
    right: MARGIN + 'px',
    width: defaultW + 'px',
    height: defaultH + 'px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    zIndex: '100',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  });

  // Canvas fills the container
  const canvas = document.createElement('canvas');
  canvas.id = OVERLAY_ID;
  Object.assign(canvas.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  });

  // Resize handle — bottom-left corner, draggable
  const handle = document.createElement('div');
  handle.id = HANDLE_ID;
  Object.assign(handle.style, {
    position: 'absolute',
    bottom: '0',
    left: '0',
    width: '20px',
    height: '20px',
    cursor: 'nesw-resize',
    pointerEvents: 'auto',
    zIndex: '101',
    background: 'linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.4) 50%)',
    borderBottomLeftRadius: '6px',
  });

  container.appendChild(canvas);
  container.appendChild(handle);
  player.appendChild(container);

  resizeCanvas(canvas, container);

  // Restore previously saved size if available
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['pianorain_width', 'pianorain_height'], (prefs) => {
      if (chrome.runtime.lastError) return;
      if (prefs.pianorain_width && prefs.pianorain_height) {
        const savedW = Math.max(MIN_WIDTH, prefs.pianorain_width);
        const savedH = Math.max(MIN_HEIGHT, prefs.pianorain_height);
        container.style.width = savedW + 'px';
        container.style.height = savedH + 'px';
        resizeCanvas(canvas, container);
      }
    });
  }

  return canvas;
}

/**
 * Resizes the canvas pixel dimensions to match the container's current size.
 * @param {HTMLCanvasElement} canvas
 * @param {Element} [container]
 */
function resizeCanvas(canvas, container) {
  const box = container || document.getElementById(CONTAINER_ID);
  if (!box) return;
  const rect = box.getBoundingClientRect();
  canvas.width = rect.width || box.clientWidth;
  canvas.height = rect.height || box.clientHeight;
}

/**
 * Removes the canvas overlay container from the DOM.
 */
function removeOverlay() {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) existing.remove();
  // Also clean up any legacy bare canvas
  const legacyCanvas = document.getElementById(OVERLAY_ID);
  if (legacyCanvas) legacyCanvas.remove();
}

/**
 * Attaches resize and fullscreen listeners that keep the canvas sized correctly.
 * Also sets up the drag-to-resize interaction on the handle element.
 * Returns a cleanup function to detach all listeners.
 * @param {HTMLCanvasElement} canvas
 * @returns {Function} cleanup
 */
function attachResizeListeners(canvas) {
  const container = canvas.parentElement;
  const handle = document.getElementById(HANDLE_ID);

  function clampContainer() {
    if (!container) return;
    const player = document.querySelector('#movie_player');
    if (!player) return;
    const maxW = player.clientWidth - MARGIN * 2;
    const maxH = player.clientHeight - MARGIN * 2;
    const w = parseInt(container.style.width, 10);
    const h = parseInt(container.style.height, 10);
    const clampedW = Math.min(Math.max(w, MIN_WIDTH), maxW);
    const clampedH = Math.min(Math.max(h, MIN_HEIGHT), maxH);
    if (clampedW !== w) container.style.width = clampedW + 'px';
    if (clampedH !== h) container.style.height = clampedH + 'px';
    resizeCanvas(canvas, container);
  }

  function onResize() {
    clampContainer();
  }

  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onResize);

  // Drag-to-resize from the bottom-left handle
  let startX, startY, startW, startH;

  function onMouseMove(e) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Handle is on the bottom-left: dragging left increases width (right edge is fixed)
    const newW = Math.max(MIN_WIDTH, startW - dx);
    const newH = Math.max(MIN_HEIGHT, startH + dy);
    const player = document.querySelector('#movie_player');
    const maxW = player ? player.clientWidth - MARGIN * 2 : newW;
    const maxH = player ? player.clientHeight - MARGIN * 2 : newH;
    container.style.width = Math.min(newW, maxW) + 'px';
    container.style.height = Math.min(newH, maxH) + 'px';
    resizeCanvas(canvas, container);
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    // Persist user-chosen size
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        pianorain_width: parseInt(container.style.width, 10),
        pianorain_height: parseInt(container.style.height, 10),
      }, () => { if (chrome.runtime.lastError) { /* ignore */ } });
    }
  }

  function onMouseDown(e) {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    startW = container.offsetWidth;
    startH = container.offsetHeight;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  if (handle) {
    handle.addEventListener('mousedown', onMouseDown);
  }

  return function cleanup() {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('fullscreenchange', onResize);
    if (handle) {
      handle.removeEventListener('mousedown', onMouseDown);
    }
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
}
