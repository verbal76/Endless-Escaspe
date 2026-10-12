// Smoke test of an UNPACKED Linux desktop build (docs/PLATFORM_SUPPORT.md): launches it for real (run under xvfb-run on a
// headless machine), drives it over the Chrome DevTools protocol and checks the contract that matters for shipping:
// the game loads from app://, works offline, the preload bridge exists, saves are mirrored and restored.
// This is a smoke test, not a hardware or gameplay test. Usage: node smoke.mjs "<dir>/Endless Escape" [--keep]
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: smoke.mjs <unpacked build dir>');
const PORT = 9341 + Math.floor(Math.random() * 400);
const ud = mkdtempSync(join(tmpdir(), 'ee-smoke-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
};

const launch = () =>
  spawn(join(dir, 'endless-escape.sh'), [`--remote-debugging-port=${PORT}`, `--user-data-dir=${ud}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'], { stdio: 'ignore' });

async function appTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const t = list.find((x) => x.type === 'page' && String(x.url).startsWith('app://'));
      if (t) return t;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error('the app window never appeared');
}

async function session() {
  const t = await appTarget();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const evaluate = (expression) => new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result?.result?.value)));
    ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  return { evaluate, close: () => ws.close() };
}

const stop = async (proc) => { proc.kill('SIGTERM'); await sleep(1500); };
let proc;
try {
  proc = launch();
  let s = await session();
  for (let i = 0; i < 90; i++) {
    if (/NEW RUN|CONTINUE/i.test((await s.evaluate('document.body.innerText').catch(() => '')) || '')) break;
    await sleep(1000);
  }
  const info = await s.evaluate(`({ url: location.href, desktop: !!(window.desktop && window.desktop.isDesktop), platform: window.desktop && window.desktop.platform, text: document.body.innerText.slice(0, 160) })`);
  check('the game loads from app://game/', String(info.url).startsWith('app://game/'), info.url);
  check('title screen renders (offline)', /NEW RUN|CONTINUE/i.test(info.text), JSON.stringify(info.text));
  check('desktop bridge present', info.desktop === true && info.platform === 'linux');
  const blocked = await s.evaluate(`fetch('https://example.com/', { mode: 'no-cors' }).then(() => 'reached', () => 'blocked')`);
  check('outbound network requests are blocked', blocked === 'blocked', blocked);

  const roster = JSON.stringify({ v: 2, saves: { smoke: { name: 'MIRROR', best: 1 } } });
  await s.evaluate(`localStorage.setItem('endless-escaspe:saves:v1', ${JSON.stringify(roster)})`);
  await sleep(4500);
  const mirrorFile = join(ud, 'saves', 'mirror.json');
  check('save mirror written atomically to the user-data dir', existsSync(mirrorFile) && readFileSync(mirrorFile, 'utf8').includes('MIRROR'));
  s.close();
  await stop(proc);

  rmSync(join(ud, 'Local Storage'), { recursive: true, force: true });
  rmSync(join(ud, 'IndexedDB'), { recursive: true, force: true });
  proc = launch();
  s = await session();
  await sleep(2500);
  check('saves restored from the mirror after profile storage was wiped', (await s.evaluate(`localStorage.getItem('endless-escaspe:saves:v1')`)) === roster);
  await s.evaluate(`localStorage.setItem('endless-escaspe:saves:v1', ${JSON.stringify(JSON.stringify({ v: 2, saves: { newer: { name: 'NEWER' } } }))})`);
  await sleep(4000);
  s.close();
  await stop(proc);
  proc = launch();
  s = await session();
  await sleep(2500);
  check('existing (newer) saves are never overwritten by the mirror', /NEWER/.test((await s.evaluate(`localStorage.getItem('endless-escaspe:saves:v1')`)) || ''));
  s.close();
} finally {
  if (proc) proc.kill('SIGTERM');
  if (!process.argv.includes('--keep')) rmSync(ud, { recursive: true, force: true });
}
const ok = results.length > 0 && results.every(Boolean);
console.log(ok ? '\nSMOKE PASS' : '\nSMOKE FAIL');
process.exit(ok ? 0 : 1);
