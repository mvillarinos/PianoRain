// lib/playhead-sync.js — Video event listeners and play/pause/seek sync

/**
 * Attaches video event listeners for PianoRain synchronisation.
 *
 * @param {HTMLVideoElement} video
 * @param {object} callbacks
 * @param {Function} callbacks.onPlay    - called when video starts playing
 * @param {Function} callbacks.onPause   - called when video pauses
 * @param {Function} callbacks.onSeeked  - called when seek completes (clear notes, restart)
 * @param {Function} callbacks.onRateChange - called when playbackRate changes
 * @returns {Function} cleanup — call to remove all event listeners
 */
function attachVideoSync(video, { onPlay, onPause, onSeeked, onRateChange }) {
  function handlePlay() { if (onPlay) onPlay(); }
  function handlePause() { if (onPause) onPause(); }
  function handleSeeked() { if (onSeeked) onSeeked(); }
  function handleRateChange() { if (onRateChange) onRateChange(video.playbackRate); }

  video.addEventListener('play', handlePlay);
  video.addEventListener('pause', handlePause);
  video.addEventListener('seeked', handleSeeked);
  video.addEventListener('ratechange', handleRateChange);

  return function cleanup() {
    video.removeEventListener('play', handlePlay);
    video.removeEventListener('pause', handlePause);
    video.removeEventListener('seeked', handleSeeked);
    video.removeEventListener('ratechange', handleRateChange);
  };
}
