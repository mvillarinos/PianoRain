# Essentia.js WASM vendor files

Place the following Essentia.js WASM build files in this directory:

- `essentia-wasm.web.js`
- `essentia-wasm.web.wasm`

## How to obtain

Download the latest pre-built WASM distribution from the official Essentia.js releases:

**Option A — CDN / GitHub Releases:**

1. Visit https://github.com/MTG/essentia.js/releases
2. Download the latest `essentia-wasm.web.js` and `essentia-wasm.web.wasm` files
3. Place both files in this directory (`pianorain/vendor/essentia/`)

**Option B — npm package:**

```bash
npm install essentia.js
cp node_modules/essentia.js/dist/essentia-wasm.web.js ./
cp node_modules/essentia.js/dist/essentia-wasm.web.wasm ./
```

## Fallback behaviour

PianoRain includes a lightweight FFT peak-picking pitch detector as a built-in
fallback. If the WASM files are absent, the extension will still work — just
with lower pitch detection accuracy. A console warning will be logged:

```
[PianoRain] Essentia.js WASM not available, using fallback detector
```
