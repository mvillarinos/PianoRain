// popup.js — PianoRain popup logic

const toggleBtn = document.getElementById('toggle-btn');
const statusBadge = document.getElementById('status-indicator');
const colorPicker = document.getElementById('note-color');
const errorMsg = document.getElementById('error-message');
const exportBtn = document.getElementById('export-midi-btn');
const exportRow = document.getElementById('export-row');
const exportProgress = document.getElementById('export-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

let isActive = false;

function setStatus(state, message) {
  statusBadge.className = `status-badge ${state}`;
  switch (state) {
    case 'active':
      statusBadge.textContent = 'Active';
      toggleBtn.textContent = 'Deactivate';
      toggleBtn.className = 'btn btn-deactivate';
      errorMsg.style.display = 'none';
      exportRow.style.display = 'block';
      exportBtn.disabled = false;
      exportBtn.textContent = 'Export MIDI';
      exportProgress.style.display = 'none';
      break;
    case 'inactive':
      statusBadge.textContent = 'Inactive';
      toggleBtn.textContent = 'Activate';
      toggleBtn.className = 'btn btn-activate';
      errorMsg.style.display = 'none';
      exportRow.style.display = 'none';
      break;
    case 'error':
      statusBadge.textContent = 'Error';
      toggleBtn.textContent = 'Retry';
      toggleBtn.className = 'btn btn-activate';
      exportRow.style.display = 'none';
      if (message) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
      }
      break;
    case 'exporting':
      statusBadge.textContent = 'Exporting';
      exportBtn.disabled = true;
      exportBtn.textContent = 'Exporting...';
      exportProgress.style.display = 'flex';
      break;
  }
}

// Load stored preferences
chrome.storage.local.get(['active', 'noteColor'], (prefs) => {
  isActive = !!prefs.active;
  if (prefs.noteColor) colorPicker.value = prefs.noteColor;
  setStatus(isActive ? 'active' : 'inactive');
});

// Listen for status updates from content script (via background)
chrome.runtime.onMessage.addListener((message) => {
  if (message.target === 'popup') {
    if (message.type === 'status') {
      setStatus(message.state, message.message);
      if (message.state === 'active') isActive = true;
      if (message.state === 'inactive' || message.state === 'error') isActive = false;
    }
    if (message.type === 'exportProgress') {
      const pct = Math.round(message.progress * 100);
      progressFill.style.width = pct + '%';
      progressText.textContent = pct + '%';
    }
  }
});

// Toggle button
toggleBtn.addEventListener('click', () => {
  const newActive = !isActive;
  chrome.storage.local.set({ active: newActive });

  chrome.runtime.sendMessage(
    {
      target: 'content',
      type: newActive ? 'activate' : 'deactivate',
      noteColor: colorPicker.value,
    },
    (response) => {
      if (chrome.runtime.lastError || (response && response.error)) {
        const errText = (response && response.error) || chrome.runtime.lastError?.message;
        setStatus('error', errText);
        chrome.storage.local.set({ active: false });
        isActive = false;
      } else {
        isActive = newActive;
        setStatus(newActive ? 'active' : 'inactive');
      }
    }
  );
});

// Color picker change
colorPicker.addEventListener('input', () => {
  const color = colorPicker.value;
  chrome.storage.local.set({ noteColor: color });

  if (isActive) {
    chrome.runtime.sendMessage({
      target: 'content',
      type: 'updateColor',
      noteColor: color,
    });
  }
});

// Export MIDI button
exportBtn.addEventListener('click', () => {
  setStatus('exporting');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';

  chrome.runtime.sendMessage(
    { target: 'content', type: 'exportMidi' },
    (response) => {
      exportBtn.disabled = false;
      exportBtn.textContent = 'Export MIDI';
      exportProgress.style.display = 'none';
      if (chrome.runtime.lastError || (response && response.error)) {
        const errText = (response && response.error) || chrome.runtime.lastError?.message;
        errorMsg.textContent = errText;
        errorMsg.style.display = 'block';
      }
    }
  );
});
