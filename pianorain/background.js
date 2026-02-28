// background.js — Service worker for PianoRain
// Handles messaging between popup and content script, and stores user preferences.

const DEFAULT_PREFS = {
  active: false,
  noteColor: '#00BFFF',
};

// Initialize default preferences on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULT_PREFS), (stored) => {
    const toSet = {};
    for (const [key, val] of Object.entries(DEFAULT_PREFS)) {
      if (stored[key] === undefined) toSet[key] = val;
    }
    if (Object.keys(toSet).length > 0) {
      chrome.storage.local.set(toSet);
    }
  });
});

// Forward messages from popup → active YouTube tab (content script)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'content') {
    // Find the active YouTube tab and forward the message
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      let isYouTube = false;
      try {
        const parsed = tab && tab.url ? new URL(tab.url) : null;
        isYouTube = parsed !== null && parsed.hostname === 'www.youtube.com';
      } catch (_) {
        isYouTube = false;
      }
      if (tab && isYouTube) {
        chrome.tabs.sendMessage(tab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        });
      } else {
        sendResponse({ error: 'No active YouTube tab found' });
      }
    });
    return true; // keep message channel open for async response
  }

  // Messages from content script → popup (status updates)
  if (message.target === 'popup') {
    // Broadcast to all extension views (popup)
    chrome.runtime.sendMessage(message).catch(() => {
      // popup may be closed — ignore
    });
  }
});
