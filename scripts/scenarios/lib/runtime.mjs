// Browser plumbing for the scenario runner: Playwright resolution, a tiny
// static server for the exported bundle, Chromium launch, and the in-page
// determinism layer (seeded Math.random, virtual Date.now, stepping helpers).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');

// Playwright is deliberately NOT a dependency of the app (package.json and
// package-lock.json feed the native fingerprint). Resolve it from, in order:
//   $EE_PLAYWRIGHT_DIR  (a project dir containing node_modules/playwright)
//   the repo's node_modules          (npm i --no-save playwright)
//   <tmp>/ee-scenarios-webdeps       (shared with build.mjs)
export async function loadPlaywright() {
  const roots = [
    process.env.EE_PLAYWRIGHT_DIR,
    REPO,
    process.env.EE_SCENARIO_WEBDEPS_DIR ?? path.join(os.tmpdir(), 'ee-scenarios-webdeps'),
  ].filter(Boolean);
  for (const root of roots) {
    try {
      const req = createRequire(path.join(path.resolve(root), 'noop.js'));
      const mod = await import(pathToFileURL(req.resolve("playwright")).href);
      return mod.chromium ? mod : mod.default;
    } catch {
      // try the next one
    }
  }
  throw new Error(
    `Playwright not found (looked in: ${roots.join(', ')}).\n` +
      'Install it WITHOUT saving it to package.json:  npm i --no-save playwright\n' +
      '(or set EE_PLAYWRIGHT_DIR to a directory with node_modules/playwright).',
  );
}

// $EE_CHROME wins; else the newest chromium-*/chrome-linux/chrome under
// $PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers); else undefined, which
// lets Playwright use the browser it installed itself.
export function findChrome() {
  if (process.env.EE_CHROME) return process.env.EE_CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      const exe = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {
    // no preinstalled browsers
  }
  return undefined;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.map': 'application/json' };

export function serveDir(dir, port) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', (e) => reject(new Error(`cannot listen on port ${port}: ${e.message} (pick another with --port / EE_SCENARIO_PORT)`)));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// Runs in the page before any app code. Everything the simulation reads from
// the outside world is made a pure function of the scenario script:
//   Math.random  seeded PRNG (the guard / dog AI uses it); reseeded by startStage
//   Date.now     virtual clock, advanced 1000/60 ms per stepped frame (the
//                render path derives its smoothing dt from it); real time
//                until freeze() so app start-up still works
// and the real requestAnimationFrame loop is stopped (E.stopLoop) so nothing
// races with the scenario's own E.update(1/60) calls.
const PAGE_INIT = `(() => {
  const mk = (s) => { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const realNow = Date.now.bind(Date);
  let frozen = false, vnow = 0;
  Date.now = () => (frozen ? vnow : realNow());
  globalThis.__h = {
    freeze() { vnow = realNow(); frozen = true; },
    seed(s) { Math.random = mk(s); },
    // Advance n frames of 1/60 s. render: also draw (E.render(0)) after each.
    tick(n = 1, render = false) {
      const E = globalThis.__ee;
      for (let i = 0; i < n; i++) { E.update(1 / 60); vnow += 1000 / 60; if (render) E.render(0); }
    },
    // Up to max frames: pre(f) before each update, stop(f) after it (true ends
    // the run). Returns the number of frames stepped; sim seconds = frames / 60.
    run(max, pre, stop, render = false) {
      const E = globalThis.__ee;
      for (let f = 0; f < max; f++) {
        if (pre) pre(f);
        E.update(1 / 60); vnow += 1000 / 60;
        if (render) E.render(0);
        if (stop && stop(f)) return f + 1;
      }
      return max;
    },
    // Replace the scene's obstacle list (and hide the old meshes).
    setObstacles(list) {
      const arr = globalThis.__ee.scene.procgen.obstacles();
      for (const o of arr) if (o.mesh) o.mesh.visible = false;
      arr.length = 0;
      for (const o of list) arr.push({ id: 9000 + arr.length, mesh: null, ...o });
    },
    // Per-frame pin: player, one guard (aimed at the player unless winding up)
    // and optionally every other guard parked away. Use as the pre() of run().
    hold(spec) {
      const E = globalThis.__ee;
      return () => {
        if (spec.player) { E.player.x = spec.player[0]; E.player.z = spec.player[1]; }
        const gi = spec.guardIdx ?? 0;
        if (spec.guard) {
          const g = E.scene.guards[gi];
          g.x = spec.guard[0]; g.z = spec.guard[1];
          if (g.aimTimer <= 0) g.facing = Math.atan2(spec.player[1] - g.z, spec.player[0] - g.x);
        }
        if (spec.parkOthers) {
          for (let i = 0; i < E.scene.guards.length; i++) {
            if (i === gi) continue;
            const g = E.scene.guards[i]; g.x = 8; g.z = -1.5 + i * 0.01; g.stunTimer = 99;
          }
        }
      };
    },
    // Stun every guard and send every dog fleeing (keeps a scripted walk quiet).
    quiet() {
      const E = globalThis.__ee;
      for (const g of E.scene.guards) g.stunTimer = 5;
      for (const d of E.scene.dogs) { d.state = 'flee'; d.stateTimer = 5; }
    },
  };
  globalThis.__h.seed(1);
})();`;

export async function launchGame({ dist, port, viewport = { width: 915, height: 412 } }) {
  const pw = await loadPlaywright();
  const server = await serveDir(dist, port);
  const browser = await pw.chromium.launch({
    executablePath: findChrome(),
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(PAGE_INIT);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => !!globalThis.__ee, null, { timeout: 90000 });
  await page.waitForTimeout(800); // let the first GL frames and effects settle
  await page.evaluate(() => {
    if (typeof globalThis.__ee.stopLoop !== 'function') throw new Error('bundle has no __ee.stopLoop; rebuild with scripts/scenarios/build.mjs');
    globalThis.__ee.stopLoop();
    globalThis.__h.freeze();
  });
  await page.waitForTimeout(100); // a frame already queued by the loop may still run once
  const close = async () => {
    await browser.close().catch(() => {});
    await new Promise((r) => server.close(r));
  };
  return { page, errors, close };
}
