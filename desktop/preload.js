'use strict';
// Runs in the isolated preload world before any page script. Exposes a tiny, fixed API (quit / fullscreen / platform)
// and keeps a device-local mirror of the game's saves next to the app data (see lib.js SaveMirror).
const { contextBridge, ipcRenderer } = require('electron');

const SAVE_KEY = 'endless-escaspe:saves:v1';
const PREFIX = 'endless-escaspe:';

// 1) Restore: only when this origin has no saves at all (fresh profile, wiped site data) and a mirror exists.
try {
  if (window.localStorage.getItem(SAVE_KEY) === null) {
    const keys = ipcRenderer.sendSync('ee:mirror-read');
    if (keys && typeof keys[SAVE_KEY] === 'string') {
      for (const [k, v] of Object.entries(keys)) if (k.startsWith(PREFIX) && window.localStorage.getItem(k) === null) window.localStorage.setItem(k, v);
    }
  }
} catch {
  // storage unavailable: the game then runs from its in-memory state exactly like a first launch
}

// 2) Mirror: snapshot on a timer and whenever the window is hidden / closing. Main refuses a snapshot without a roster.
let lastSig = '';
function snapshot() {
  try {
    const keys = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys[k] = window.localStorage.getItem(k);
    }
    const sig = JSON.stringify(keys);
    if (sig === lastSig) return;
    lastSig = sig;
    ipcRenderer.send('ee:mirror-write', keys);
  } catch {
    // ignore: the next tick retries
  }
}
setInterval(snapshot, 3000);
window.addEventListener('visibilitychange', () => snapshot());
window.addEventListener('pagehide', snapshot);
window.addEventListener('beforeunload', snapshot);

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  quit: () => ipcRenderer.send('ee:quit'),
  toggleFullscreen: () => ipcRenderer.send('ee:toggle-fullscreen'),
});
