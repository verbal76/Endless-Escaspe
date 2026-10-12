// Coordinated release bundle (docs/RELEASING.md): one build number, one source SHA, up to three platform artifacts.
//
//   node scripts/ci/assemble-release.mjs --in <dir with the platform artifacts> --out <bundle dir>
//        --build <N> --source-sha <sha> --platforms android,windows,linux [--run-url ..] [--run-id ..] [--request-commit ..] [--request-ref ..]
//   node scripts/ci/assemble-release.mjs --verify <bundle dir>
//
// Names (owner standard): release "Endless Escape Build NN"; "Endless Escape Build NN APK.apk", "... EXE.zip",
// "... Linux.tar.gz", plus build-manifest.json and checksums.sha256. The manifest hashes are computed from the bytes
// in the bundle, never copied from an earlier step, and the whole bundle is re-verified before anything is published.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLATFORM_KEYS = ['android', 'windows', 'linux'];
const SUFFIX = { android: 'APK.apk', windows: 'EXE.zip', linux: 'Linux.tar.gz' };

export const releaseTitle = (product, build) => `${product} Build ${build}`;
export const artifactName = (product, build, platform) => {
  if (!SUFFIX[platform]) throw new Error(`unknown platform ${platform}`);
  return `${product} Build ${build} ${SUFFIX[platform]}`;
};
export const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Expand a request platform ("all" or one name) to the platform list. */
export function platformsFor(platform) {
  if (platform === 'all') return [...PLATFORM_KEYS];
  if (PLATFORM_KEYS.includes(platform)) return [platform];
  throw new Error(`unknown platform ${platform}`);
}

/** Pure: the manifest from already-measured artifacts. */
export function composeManifest({ product, build, sourceSha, requestCommit, requestRef, runId, runUrl, destination, timestamp, artifacts, details }) {
  if (!/^[0-9a-f]{40}$/.test(String(sourceSha))) throw new Error('source sha must be 40 hex characters');
  return {
    schema: 2,
    product,
    buildNumber: Number(build),
    title: releaseTitle(product, build),
    source: { sha: sourceSha, requestCommit: requestCommit || null, requestRef: requestRef || null },
    build: { timestamp, destination: destination || null, runId: runId || null, runUrl: runUrl || null },
    artifacts: artifacts.map((a) => ({ platform: a.platform, file: a.file, sha256: a.sha256, sizeBytes: a.sizeBytes, details: details?.[a.platform] ?? null })),
  };
}

/** Pure: check a manifest + checksums text against measured files. Returns a list of problems. */
export function verifyBundle(manifest, checksums, measured, expectedPlatforms) {
  const errors = [];
  if (manifest.schema !== 2) errors.push('manifest schema must be 2');
  const got = manifest.artifacts.map((a) => a.platform).sort();
  const want = [...expectedPlatforms].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) errors.push(`manifest platforms [${got}] differ from the requested [${want}]: a coordinated release is complete or it is not published`);
  for (const a of manifest.artifacts) {
    const want = artifactName(manifest.product, manifest.buildNumber, a.platform);
    if (a.file !== want) errors.push(`${a.platform} artifact is named "${a.file}", expected "${want}"`);
    const m = measured[a.file];
    if (!m) { errors.push(`${a.file} is not in the bundle`); continue; }
    if (m.size !== a.sizeBytes) errors.push(`${a.file}: manifest size ${a.sizeBytes} != actual ${m.size}`);
    if (m.sha256 !== a.sha256) errors.push(`${a.file}: manifest sha256 differs from the file`);
    const line = checksums.split('\n').map((l) => l.trim()).filter(Boolean).find((l) => l.endsWith(`  ${a.file}`) || l.endsWith(` *${a.file}`));
    if (!line || line.split(/\s+/)[0] !== a.sha256) errors.push(`${a.file}: checksums.sha256 does not list it with its actual SHA-256`);
  }
  return errors;
}

const measureDir = (dir) => {
  const out = {};
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (!statSync(p).isFile()) continue;
    const bytes = readFileSync(p);
    out[f] = { size: bytes.length, sha256: sha256Of(bytes) };
  }
  return out;
};

export function assemble(opts) {
  const { inDir, outDir, build, sourceSha, platforms } = opts;
  const product = opts.product || JSON.parse(readFileSync('release.json', 'utf8')).productName;
  mkdirSync(outDir, { recursive: true });
  const artifacts = [];
  const details = {};
  for (const platform of platforms) {
    const src = join(inDir, artifactName(product, build, platform));
    if (!existsSync(src)) throw new Error(`missing artifact for ${platform}: ${src}`);
    const file = artifactName(product, build, platform);
    copyFileSync(src, join(outDir, file));
    const bytes = readFileSync(join(outDir, file));
    artifacts.push({ platform, file, sha256: sha256Of(bytes), sizeBytes: bytes.length });
    const sidecar = join(inDir, `${platform}.details.json`);
    if (existsSync(sidecar)) details[platform] = JSON.parse(readFileSync(sidecar, 'utf8'));
  }
  const manifest = composeManifest({ product, build, sourceSha, requestCommit: opts.requestCommit, requestRef: opts.requestRef, runId: opts.runId, runUrl: opts.runUrl, destination: opts.destination, timestamp: opts.timestamp || new Date().toISOString(), artifacts, details });
  writeFileSync(join(outDir, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(outDir, 'checksums.sha256'), artifacts.map((a) => `${a.sha256}  ${a.file}`).join('\n') + '\n');
  return manifest;
}

export function verifyDir(dir, expectedPlatforms) {
  const manifest = JSON.parse(readFileSync(join(dir, 'build-manifest.json'), 'utf8'));
  const checksums = readFileSync(join(dir, 'checksums.sha256'), 'utf8');
  const errors = verifyBundle(manifest, checksums, measureDir(dir), expectedPlatforms ?? manifest.artifacts.map((a) => a.platform));
  const extra = readdirSync(dir).filter((f) => f !== 'build-manifest.json' && f !== 'checksums.sha256' && !manifest.artifacts.some((a) => a.file === f));
  for (const f of extra) errors.push(`unexpected file in the bundle: ${f}`);
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
  try {
    if (arg('verify')) {
      const errors = verifyDir(arg('verify'), arg('platforms') ? arg('platforms').split(',') : undefined);
      for (const e of errors) console.error(`::error::${e}`);
      console.log(errors.length ? 'bundle verification FAILED' : 'bundle verified: manifest, checksums and files agree');
      process.exit(errors.length ? 1 : 0);
    }
    const platforms = arg('platforms').split(',');
    const m = assemble({ inDir: arg('in'), outDir: arg('out'), build: arg('build'), sourceSha: arg('source-sha'), platforms, runId: arg('run-id'), runUrl: arg('run-url'), requestCommit: arg('request-commit'), requestRef: arg('request-ref'), destination: arg('destination') });
    const errors = verifyDir(arg('out'), platforms);
    for (const e of errors) console.error(`::error::${e}`);
    if (errors.length) process.exit(1);
    console.log(`assembled ${m.title}: ${m.artifacts.map((a) => a.file).join(', ')}`);
  } catch (e) {
    console.error(`::error::${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
