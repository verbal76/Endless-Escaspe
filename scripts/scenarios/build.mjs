#!/usr/bin/env node
// Builds the web bundle the browser scenarios run against.
//
// Nothing in the repository is modified. The app sources are copied into a
// TEMP directory, a debug hook (`globalThis.__ee`) is injected into the TEMP
// copy of src/game/Game.tsx only, and `expo export --platform web` runs
// there. node_modules is symlinked from the repo.
//
//   node scripts/scenarios/build.mjs [--out <dir>]
//
// Env: EE_SCENARIO_BUILD_DIR  work dir (default: <os tmpdir>/ee-scenarios-build)
// Output: <work dir>/dist (printed on the last line as `DIST=<path>`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '..', '..');

const ANCHOR = '    loopRef.current = startLoop({';
// What the scenarios rely on. `stopLoop` halts the real requestAnimationFrame
// loop so scenarios can step the simulation manually (E.update(1/60)) with no
// race against it. The loop is NOT re-armed; reload the page for a live one.
const HOOK = `    (globalThis as any).__ee = {
      input, useStore, player, THREE,
      get scene() { return scene; },
      handleCatch, handleWin, noiseRing, crowbarMarker, projectiles, update, render,
      get renderer() { return r; },
      stopLoop() { loopRef.current?.stop(); },
    };
`;

// The repo does not depend on the web runtime (it is an Android app). The web
// export needs these three, at the versions `npx expo install` picks for
// SDK 54. They are installed once into a cache dir, never into the repo.
const WEB_DEPS = ['react-dom@19.1.0', 'react-native-web@~0.21.0', '@expo/metro-runtime@~6.1.2'];

function ensureWebDeps(log) {
  const dir = path.resolve(process.env.EE_SCENARIO_WEBDEPS_DIR ?? path.join(os.tmpdir(), 'ee-scenarios-webdeps'));
  const ok = () => ['react-dom', 'react-native-web', '@expo/metro-runtime'].every((p) => fs.existsSync(path.join(dir, 'node_modules', p, 'package.json')));
  if (ok()) return dir;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"ee-scenarios-webdeps","private":true}');
  log(`installing web runtime deps into ${dir}: ${WEB_DEPS.join(' ')}`);
  // --legacy-peer-deps: do not pull a second copy of react (the repo's is used).
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--legacy-peer-deps', ...WEB_DEPS], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0 || !ok()) throw new Error(`npm install of web deps failed\n${r.stdout}${r.stderr}`);
  return dir;
}

// work/node_modules = every repo package (symlinked) + the web deps.
function linkNodeModules(workDir, webDepsDir) {
  const out = path.join(workDir, 'node_modules');
  fs.mkdirSync(out);
  const link = (from, to) => { if (!fs.existsSync(to) && !isLink(to)) fs.symlinkSync(from, to, 'dir'); };
  const isLink = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
  const repoNm = path.join(REPO, 'node_modules');
  for (const name of fs.readdirSync(repoNm)) {
    if (name === '.bin') { link(path.join(repoNm, name), path.join(out, name)); continue; }
    if (!name.startsWith('@')) { link(path.join(repoNm, name), path.join(out, name)); continue; }
    fs.mkdirSync(path.join(out, name), { recursive: true });
    for (const sub of fs.readdirSync(path.join(repoNm, name))) link(path.join(repoNm, name, sub), path.join(out, name, sub));
  }
  const webNm = path.join(webDepsDir, 'node_modules');
  for (const name of fs.readdirSync(webNm)) {
    if (name === '.bin' || name === '.package-lock.json') continue;
    if (!name.startsWith('@')) { link(path.join(webNm, name), path.join(out, name)); continue; }
    fs.mkdirSync(path.join(out, name), { recursive: true });
    for (const sub of fs.readdirSync(path.join(webNm, name))) link(path.join(webNm, name, sub), path.join(out, name, sub));
  }
}

export function build({ workDir, log = console.log } = {}) {
  workDir = path.resolve(workDir ?? process.env.EE_SCENARIO_BUILD_DIR ?? path.join(os.tmpdir(), 'ee-scenarios-build'));
  const gameSrc = fs.readFileSync(path.join(REPO, 'src/game/Game.tsx'), 'utf8');
  if (!gameSrc.includes(ANCHOR)) {
    throw new Error(`debug-hook anchor not found in src/game/Game.tsx:\n${ANCHOR}\nThe scenario build must be updated to match the new startLoop call site.`);
  }
  if (gameSrc.split(ANCHOR).length !== 2) throw new Error('debug-hook anchor occurs more than once in src/game/Game.tsx');

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  for (const f of ['src', 'assets']) fs.cpSync(path.join(REPO, f), path.join(workDir, f), { recursive: true });
  for (const f of ['App.tsx', 'index.ts', 'app.json', 'app.config.js', 'babel.config.js', 'tsconfig.json', 'package.json']) {
    if (fs.existsSync(path.join(REPO, f))) fs.copyFileSync(path.join(REPO, f), path.join(workDir, f));
  }
  const webDeps = ensureWebDeps(log);
  linkNodeModules(workDir, webDeps);
  // Metro does not follow symlinks that leave the project unless the real
  // locations are watched.
  fs.writeFileSync(path.join(workDir, 'metro.config.js'), `const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const roots = [${JSON.stringify(path.join(REPO, 'node_modules'))}, ${JSON.stringify(path.join(webDeps, 'node_modules'))}];
config.watchFolders = [...(config.watchFolders || []), ...roots];
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths || []), ...roots];
module.exports = config;
`);

  const tempGame = path.join(workDir, 'src/game/Game.tsx');
  fs.writeFileSync(tempGame, gameSrc.replace(ANCHOR, HOOK + ANCHOR));
  if (!fs.readFileSync(tempGame, 'utf8').includes('globalThis as any).__ee')) throw new Error('hook injection failed');

  log(`building web bundle in ${workDir} (a minute or two)...`);
  const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], {
    cwd: workDir, env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1' }, encoding: 'utf8', maxBuffer: 1 << 28,
  });
  if (r.status !== 0) {
    throw new Error(`expo export failed (exit ${r.status})\n${(r.stdout + r.stderr).split('\n').slice(-40).join('\n')}`);
  }
  const dist = path.join(workDir, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('expo export produced no dist/index.html');
  return dist;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  try {
    const dist = build({ workDir: i > 0 ? process.argv[i + 1] : undefined });
    console.log(`DIST=${dist}`);
  } catch (e) {
    console.error(`BUILD FAILED: ${e.message}`);
    process.exit(1);
  }
}
