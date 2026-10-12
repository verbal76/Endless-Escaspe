'use strict';
// Endless Escape desktop shell (Windows x64 / Linux x64). Loads the unchanged Expo web export from app://game/.
// No network access is needed or used: the game runs fully offline. Updates are delivered by the store (SteamPipe),
// never by an in-app updater, so expo-updates is inert here.
const { app, BrowserWindow, ipcMain, net, protocol, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { mimeFor, resolveAppPath, SaveMirror, writeAtomic, readWithFallback } = require('./lib');

const WEB_ROOT = path.join(__dirname, 'web');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const userData = app.getPath('userData');
const mirror = new SaveMirror(path.join(userData, 'saves', 'mirror.json'));
const windowStateFile = path.join(userData, 'window.json');

function readWindowState() {
  try {
    const t = readWithFallback(windowStateFile, (x) => !!JSON.parse(x));
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
function writeWindowState(state) {
  try {
    writeAtomic(windowStateFile, JSON.stringify(state));
  } catch {
    // preferences only
  }
}

// Steam Deck (Gaming Mode sets SteamDeck=1) and big-picture style launches start fullscreen; so does --fullscreen.
const isDeck = process.env.SteamDeck === '1' || process.env.SteamOS === '1';
const wantFullscreen = process.argv.includes('--fullscreen') || isDeck;

let win = null;

function createWindow() {
  const saved = readWindowState();
  win = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 800,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#0b0f14',
    title: 'Endless Escape',
    autoHideMenuBar: true,
    fullscreen: wantFullscreen || saved.fullscreen === true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: process.env.EE_DEBUG === '1',
      backgroundThrottling: false, // keep the game loop and audio clock steady while the window is partly covered
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://game/')) e.preventDefault();
  });
  win.on('close', () => {
    const b = win.getNormalBounds();
    writeWindowState({ width: b.width, height: b.height, fullscreen: win.isFullScreen() });
  });
  win.on('closed', () => {
    win = null;
  });
  win.loadURL('app://game/');
}

ipcMain.on('ee:quit', () => app.quit());
ipcMain.on('ee:toggle-fullscreen', () => {
  if (win) win.setFullScreen(!win.isFullScreen());
});
ipcMain.on('ee:mirror-read', (e) => {
  try {
    e.returnValue = mirror.read();
  } catch {
    e.returnValue = null;
  }
});
ipcMain.on('ee:mirror-write', (_e, snapshot) => {
  try {
    mirror.write(snapshot);
  } catch {
    // the localStorage copy is still authoritative
  }
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // No outbound requests from the page: everything is served from app://. Block anything else defensively.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const u = details.url;
    cb({ cancel: !(u.startsWith('app://') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('devtools:')) });
  });
  protocol.handle('app', (request) => {
    const file = resolveAppPath(WEB_ROOT, request.url);
    if (!file) return new Response('Not found', { status: 404 });
    // Serve through net.fetch(file://) so range requests (audio) work; set the type explicitly.
    return net.fetch(pathToFileURL(file).toString()).then((r) => {
      const h = new Headers(r.headers);
      h.set('content-type', mimeFor(file));
      return new Response(r.body, { status: r.status, headers: h });
    });
  });
  createWindow();
  // F11 / Alt+Enter toggle fullscreen; Ctrl+Q quits (the game layer leaves Ctrl/Alt combinations alone).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.control && input.key.toLowerCase() === 'q') {
      app.quit();
    }
  });
});

app.on('window-all-closed', () => app.quit());
