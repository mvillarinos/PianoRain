# PianoRain 🎹

A **Chrome Extension (Manifest V3)** that listens to any YouTube piano video in real time, detects the notes being played using **Essentia.js (WASM)**, and renders a **Synthesia-style falling notes visualization** with a virtual piano keyboard directly overlaid on the YouTube video player.

---

## Features

- 🎵 **Real-time pitch detection** using Essentia.js WASM (with built-in FFT fallback)
- 🎹 **88-key virtual piano keyboard** rendered at the bottom of the video
- 🎆 **Falling note blocks** (Synthesia-style) synchronized to the video playhead
- 🎨 **Customizable note color** via the popup color picker
- ⏯️ **Full video sync** — pauses, seeks, and playback rate changes are all handled
- 🔁 **YouTube SPA navigation** support — reinitializes when you switch videos

---

## Installation

### 1. Clone / download

```bash
git clone https://github.com/mvillarinos/PianoRain.git
cd PianoRain
```

### 2. Get Essentia.js WASM files (optional — improves pitch accuracy)

Follow the instructions in [`pianorain/vendor/essentia/README.md`](pianorain/vendor/essentia/README.md).

If you skip this step, the extension uses its built-in FFT peak-picking detector.

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `pianorain/` folder inside this repository

---

## Usage

1. Navigate to any YouTube video of piano music
2. Click the **PianoRain** extension icon in the Chrome toolbar
3. Click **Activate**
4. Watch the falling notes visualization appear over the video!
5. Use the **color picker** to change the note color

Click **Deactivate** (or navigate away) to stop the visualization.

---

## Architecture

```
YouTube <video> element
  └──► Web Audio API (MediaElementSource)
        ├──► AnalyserNode (FFT, fftSize: 8192)
        ├──► Essentia.js WASM / FFT peak-picking (pitch detection)
        └──► AudioContext synced to video.currentTime
              └──► Canvas Overlay (#pianorain-overlay over #movie_player)
                    ├──► Falling note blocks (top → keyboard)
                    └──► Virtual 88-key piano keyboard (bottom)
```

### File structure

```
pianorain/
├── manifest.json           Manifest V3 config
├── content.js              Main content script — orchestration
├── background.js           Service worker — popup ↔ content messaging
├── popup.html / .js / .css Extension popup UI
├── lib/
│   ├── audio-capture.js    Web Audio API setup
│   ├── note-detector.js    Pitch detection (Essentia.js + fallback)
│   ├── piano-renderer.js   88-key piano keyboard rendering
│   ├── falling-notes.js    Falling note block lifecycle
│   ├── overlay.js          Canvas overlay creation & resizing
│   └── playhead-sync.js    Video event listeners (play/pause/seek)
├── vendor/
│   └── essentia/           Essentia.js WASM files (see README inside)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Dependencies

- **Essentia.js** (optional) — https://mtg.github.io/essentia.js/
- No build step required — plain vanilla JavaScript

---

## License

See [LICENSE](LICENSE).
