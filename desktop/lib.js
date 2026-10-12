'use strict';
// Pure helpers for the desktop shell (no Electron imports, so they are unit-tested with plain node).
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
};

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/**
 * Map an app:// URL to a file inside `root`. Returns null for anything that escapes the root.
 * Unknown paths without an extension fall back to index.html (single-page app routing).
 */
function resolveAppPath(root, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const rel = pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  if (!path.extname(rel)) return path.join(rootResolved, 'index.html');
  return null;
}

/** Atomic write: temp file in the same directory, fsync, rename. The previous good copy is kept as `.bak`. */
function writeAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, `${file}.bak`);
    } catch {
      // the backup is best effort; the new file still lands
    }
  }
  fs.renameSync(tmp, file);
}

/** Read `file`, falling back to its `.bak` when it is missing or fails `valid`. Returns null if neither is usable. */
function readWithFallback(file, valid) {
  for (const f of [file, `${file}.bak`]) {
    try {
      const text = fs.readFileSync(f, 'utf8');
      if (!valid || valid(text)) return text;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const SAVE_KEY = 'endless-escaspe:saves:v1';
const MIRROR_PREFIX = 'endless-escaspe:';

const validJson = (text) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * Device-local mirror of the game's localStorage keys, kept as one JSON file in the user-data directory.
 * - write(): only when the snapshot actually has a save roster (a wiped localStorage never clobbers a good mirror)
 * - read(): the last mirrored snapshot (falls back to the .bak copy); used to restore ONLY when localStorage has no saves
 */
class SaveMirror {
  constructor(file) {
    this.file = file;
  }
  write(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || typeof snapshot[SAVE_KEY] !== 'string') return false;
    const clean = {};
    for (const [k, v] of Object.entries(snapshot)) if (k.startsWith(MIRROR_PREFIX) && typeof v === 'string') clean[k] = v;
    const text = JSON.stringify({ v: 1, keys: clean });
    const prev = readWithFallback(this.file, validJson);
    if (prev === text) return false;
    writeAtomic(this.file, text);
    return true;
  }
  read() {
    const text = readWithFallback(this.file, validJson);
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed && parsed.v === 1 && parsed.keys && typeof parsed.keys === 'object' ? parsed.keys : null;
  }
}

module.exports = { mimeFor, resolveAppPath, writeAtomic, readWithFallback, SaveMirror, SAVE_KEY, MIRROR_PREFIX };
