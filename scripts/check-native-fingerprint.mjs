// Native compatibility gate for OTA updates.
//
// Installed APKs only accept updates whose runtime version equals
// theirs (app.json `version`, runtimeVersion policy appVersion). That
// key is maintained by hand, so nothing stopped an OTA built against a
// changed native layer (new or upgraded native module, config plugin,
// native config in app.json, ...) from reaching every installed APK of
// the old runtime, which then crashes or misbehaves.
//
// This script computes the project's native fingerprint with
// @expo/fingerprint and compares it with the one recorded for the
// current app.json version in scripts/native-fingerprint.json:
//
//   node scripts/check-native-fingerprint.mjs            check (exit 1 on mismatch)
//   node scripts/check-native-fingerprint.mjs --print    print the hash, never fail
//   node scripts/check-native-fingerprint.mjs --record   record the hash for a NEW version
//
// Test / tooling flags: --hash <h> (skip computing), --recorded <file>,
// --app-json <file>, --root <dir>.
//
// The skips keep the hash independent of what CI stamps into the
// config per run (versionCode from EE_BUILD_NUMBER, extra.release from
// EE_GIT_SHA / EE_OTA_SEQUENCE) and of the version itself (the version
// is the key the hash is recorded under).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, '..');
export const DEFAULT_RECORDED = path.join(here, 'native-fingerprint.json');

export function fingerprintOptions(SourceSkips) {
  return {
    platforms: ['android'],
    silent: true,
    sourceSkips:
      SourceSkips.ExpoConfigVersions |
      SourceSkips.ExpoConfigExtraSection |
      SourceSkips.PackageJsonScriptsAll |
      SourceSkips.GitIgnore,
  };
}

export async function computeFingerprint(root = DEFAULT_ROOT) {
  // The project root must be absolute: @expo/fingerprint relativizes
  // config paths that start with the root string, so "." would turn
  // "./assets/icon.png" into "assets/icon.png" and change the hash.
  const abs = path.resolve(root);
  const require = createRequire(path.join(abs, 'package.json'));
  const { createFingerprintAsync, SourceSkips } = require('@expo/fingerprint');
  const fp = await createFingerprintAsync(abs, fingerprintOptions(SourceSkips));
  return fp.hash;
}

// Pure decision: is `hash` the recorded native fingerprint of `version`?
export function checkFingerprint({ version, hash, recorded }) {
  const expected = recorded[version];
  if (expected === hash) {
    return { ok: true, message: `native fingerprint OK: runtime ${version} = ${hash}` };
  }
  if (expected == null) {
    return {
      ok: false,
      message:
        `no native fingerprint recorded for app version ${version} (current: ${hash}).\n` +
        `If this version is a new runtime, build its APK from this commit and record the hash:\n` +
        `  node scripts/check-native-fingerprint.mjs --record`,
    };
  }
  return {
    ok: false,
    message:
      `NATIVE CHANGE: the native fingerprint of runtime ${version} is now ${hash}, ` +
      `but installed ${version} APKs were built with ${expected}.\n` +
      `An OTA from this tree could need native code those APKs don't have.\n` +
      `Fix: bump "version" in app.json (the runtime version), record the new hash with\n` +
      `  node scripts/check-native-fingerprint.mjs --record\n` +
      `and ship the change as a new APK (apk-build.yml). If the change was not meant to be native, revert it.`,
  };
}

// Returns the updated record, or throws if `version` already has a
// different hash (overwriting it would silently re-bless a native
// change for APKs that are already installed).
export function recordFingerprint({ version, hash, recorded }) {
  const existing = recorded[version];
  if (existing != null && existing !== hash) {
    throw new Error(
      `version ${version} is already recorded as ${existing}; refusing to overwrite with ${hash}. ` +
        `Bump app.json "version" for a native change.`,
    );
  }
  return { ...recorded, [version]: hash };
}

export function readAppVersion(appJsonPath) {
  return JSON.parse(readFileSync(appJsonPath, 'utf8')).expo.version;
}

export function readRecorded(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    if (e && e.code === 'ENOENT') return {};
    throw e;
  }
}

function parseArgs(argv) {
  const opts = { mode: 'check', root: DEFAULT_ROOT, recorded: DEFAULT_RECORDED, appJson: null, hash: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--print') opts.mode = 'print';
    else if (a === '--record') opts.mode = 'record';
    else if (a === '--hash') opts.hash = argv[++i];
    else if (a === '--recorded') opts.recorded = argv[++i];
    else if (a === '--app-json') opts.appJson = argv[++i];
    else if (a === '--root') opts.root = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  opts.appJson ??= path.join(opts.root, 'app.json');
  return opts;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const version = readAppVersion(opts.appJson);
  const hash = opts.hash ?? (await computeFingerprint(opts.root));
  const recorded = readRecorded(opts.recorded);
  if (opts.mode === 'record') {
    const next = recordFingerprint({ version, hash, recorded });
    writeFileSync(opts.recorded, JSON.stringify(next, null, 2) + '\n');
    console.log(`recorded native fingerprint for ${version}: ${hash}`);
    return 0;
  }
  const result = checkFingerprint({ version, hash, recorded });
  if (opts.mode === 'print') {
    console.log(`native fingerprint (android) for app version ${version}: ${hash}`);
    console.log(result.ok ? 'matches the recorded fingerprint' : `does NOT match: ${result.message}`);
    return 0;
  }
  if (result.ok) {
    console.log(result.message);
    return 0;
  }
  console.error(result.message);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    },
  );
}
