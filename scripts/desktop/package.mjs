// Package the desktop build (docs/PLATFORM_SUPPORT.md): the unchanged Expo web export + the Electron shell in desktop/.
//
//   node scripts/desktop/package.mjs --platform linux|windows --out <dir> [--name "<archive base name>"]
//        [--web <prebuilt web dist>] [--skip-export]
//
// Linux   -> <name>.tar.gz   (runs natively; ./endless-escape.sh)
// Windows -> <name>.zip      (EndlessEscape.exe). Cross-packaged on Linux: it is NOT executed here.
// The archives are deterministic for a given input (sorted entries, fixed mtimes, no owners). Nothing is uploaded.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const desktop = join(root, 'desktop');
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const platform = arg('platform');
if (!['linux', 'windows'].includes(platform)) throw new Error('--platform must be linux or windows');
const out = resolve(arg('out', join(root, 'dist-desktop')));
const name = arg('name', `Endless Escape ${platform}`);
const webDir = resolve(arg('web', join(root, 'dist-web')));
const FIXED_TIME = '2024-01-01T00:00:00Z';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });

// 1) web export (single source; EXPO_NO_WEB_SETUP because app.json keeps platforms = android, ios for the native fingerprint)
if (!flag('skip-export')) {
  rmSync(webDir, { recursive: true, force: true });
  run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', webDir], { cwd: root, env: { ...process.env, EXPO_NO_WEB_SETUP: '1', CI: '1' } });
}
if (!existsSync(join(webDir, 'index.html'))) throw new Error(`no web export at ${webDir}`);

// 2) electron runtime for the target platform
const dreq = createRequire(join(desktop, 'package.json'));
const electronVersion = dreq('electron/package.json').version;
const TOP = 'Endless Escape';
const stageRoot = join(out, '_stage', platform);
const stage = join(stageRoot, TOP);
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

let runtimeDir;
if (platform === 'linux') {
  runtimeDir = join(desktop, 'node_modules', 'electron', 'dist');
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('the Linux package must be assembled from the linux-x64 electron runtime (run on linux x64)');
} else {
  const { downloadArtifact } = dreq('@electron/get');
  const zip = await downloadArtifact({ version: electronVersion, artifactName: 'electron', platform: 'win32', arch: 'x64' });
  runtimeDir = join(out, '_electron-win32-x64');
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });
  run('unzip', ['-q', '-o', zip, '-d', runtimeDir]);
}
cpSync(runtimeDir, stage, { recursive: true, verbatimSymlinks: true });

// 3) app payload (resources/app)
const app = join(stage, 'resources', 'app');
rmSync(join(stage, 'resources', 'default_app.asar'), { force: true });
mkdirSync(app, { recursive: true });
for (const f of ['main.js', 'preload.js', 'lib.js']) cpSync(join(desktop, f), join(app, f));
const pkg = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
delete pkg.devDependencies;
delete pkg.scripts;
writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
cpSync(webDir, join(app, 'web'), { recursive: true });
cpSync(join(root, 'docs', 'THIRD-PARTY-NOTICES.md'), join(stage, 'THIRD_PARTY_NOTICES.md'));
writeFileSync(join(stage, 'README.txt'), `Endless Escape (${platform} x64)\nHot Attic Games\n\nRun ${platform === 'linux' ? './endless-escape.sh' : 'EndlessEscape.exe'}. Needs no network. F11 toggles fullscreen, Ctrl+Q quits, hold Back/View for 2 s to quit with a controller.\nSaves live in the per-user app-data directory (Endless Escape), plus a mirror file used to restore them if the profile storage is cleared.\nThird-party licences: THIRD_PARTY_NOTICES.md and LICENSES.chromium.html.\n`);

// 4) launcher / rename
if (platform === 'linux') {
  renameSync(join(stage, 'electron'), join(stage, 'endless-escape-bin'));
  // The renderer only ever loads app://game/ (navigation, popups and all network requests are blocked in main.js), so the
  // setuid chrome-sandbox helper that Steam installs cannot carry is not required; --no-sandbox is the standard Linux Steam choice.
  writeFileSync(join(stage, 'endless-escape.sh'), '#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/endless-escape-bin" --no-sandbox "$@"\n');
  chmodSync(join(stage, 'endless-escape.sh'), 0o755);
  rmSync(join(stage, 'chrome-sandbox'), { force: true });
} else {
  renameSync(join(stage, 'electron.exe'), join(stage, 'EndlessEscape.exe'));
}

// 5) deterministic archive (sorted entries, fixed mtimes, no owner ids, no gzip timestamp)
mkdirSync(out, { recursive: true });
run('find', [stageRoot, '-exec', 'touch', '-h', '-d', FIXED_TIME, '{}', '+']);
const walk = (d, base = '') => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [`${base}${e.name}/`, ...walk(join(d, e.name), `${base}${e.name}/`)] : [`${base}${e.name}`]));
const entries = [`${TOP}/`, ...walk(stage, `${TOP}/`)].sort();
const list = join(out, `_${platform}.list`);
writeFileSync(list, entries.join('\n') + '\n');
const archive = join(out, `${name}.${platform === 'linux' ? 'tar.gz' : 'zip'}`);
rmSync(archive, { force: true });
if (platform === 'linux') {
  run('sh', ['-c', 'tar --no-recursion --owner=0 --group=0 --numeric-owner -C "$1" -T "$2" -cf - | gzip -n -9 > "$3"', 'sh', stageRoot, list, archive]);
} else {
  run('sh', ['-c', 'cd "$1" && zip -X -q "$3" -@ < "$2"', 'sh', stageRoot, list, archive]);
}
rmSync(list, { force: true });
// Sidecar for the coordinated build manifest (scripts/ci/assemble-release.mjs).
const exe = join(stage, platform === 'linux' ? 'endless-escape-bin' : 'EndlessEscape.exe');
const hashFile = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
writeFileSync(join(out, `${platform}.details.json`), JSON.stringify({
  arch: 'x64',
  shell: 'electron',
  electron: electronVersion,
  runtimeExecutableSha256: hashFile(exe),
  webIndexSha256: hashFile(join(webDir, 'index.html')),
  deterministicArchive: true,
  executedOnBuilder: platform === 'linux' ? 'see smoke test' : false,
}, null, 2) + '\n');
console.log(`packaged ${archive} (${statSync(archive).size} bytes, electron ${electronVersion})`);
