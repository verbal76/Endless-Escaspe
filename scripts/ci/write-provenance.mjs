// Build provenance: one JSON record per artifact so any APK traces to its
// exact source revision (docs/RELEASING.md). Written by apk-build.yml next to
// the APK and attached to the release / workflow artifact.
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const tomlValue = (toml, key) => toml.match(new RegExp('^' + key + '\\s*=\\s*"([^"]+)"', 'm'))?.[1] ?? null;

/** Pure: compose the record from already-read inputs. */
export function composeProvenance(i) {
  return {
    schema: 1,
    product: i.release.productName,
    publicVersion: i.release.publicVersion,
    platform: i.platform,
    artifact: i.artifactName,
    sha256: i.sha256 ?? null,
    sizeBytes: i.sizeBytes ?? null,
    source: { sha: i.sourceSha, requestCommit: i.requestCommit || null, requestRef: i.requestRef || null },
    android: { packageId: i.packageId, versionName: i.versionName, versionCode: i.versionCode },
    build: { configuration: 'release', signing: i.signing, channel: i.channel, timestamp: i.timestamp, runId: i.runId || null, runUrl: i.runUrl || null },
    compatibility: { runtime: i.versionName, runtimePolicy: 'appVersion', nativeFingerprint: i.fingerprint },
    toolchain: i.toolchain,
  };
}

export function readToolchain(env = process.env) {
  const toml = (() => { try { return read('node_modules/react-native/gradle/libs.versions.toml'); } catch { return ''; } })();
  const wrapper = (() => { try { return read('android/gradle/wrapper/gradle-wrapper.properties'); } catch { return ''; } })();
  const pkgVersion = (n) => { try { return JSON.parse(read(`node_modules/${n}/package.json`)).version; } catch { return null; } };
  return {
    node: process.version,
    java: env.JAVA_VERSION || null,
    gradle: wrapper.match(/gradle-([0-9.]+)-/)?.[1] ?? null,
    agp: tomlValue(toml, 'agp'),
    kotlin: tomlValue(toml, 'kotlin'),
    ndk: tomlValue(toml, 'ndkVersion'),
    buildTools: tomlValue(toml, 'buildTools'),
    minSdk: tomlValue(toml, 'minSdk'),
    targetSdk: tomlValue(toml, 'targetSdk'),
    compileSdk: tomlValue(toml, 'compileSdk'),
    expo: pkgVersion('expo'),
    reactNative: pkgVersion('react-native'),
    react: pkgVersion('react'),
    expoUpdates: pkgVersion('expo-updates'),
  };
}

export function main(env = process.env) {
  const app = JSON.parse(read('app.json')).expo;
  const rec = composeProvenance({
    release: JSON.parse(read('release.json')),
    platform: env.PLATFORM || 'android',
    artifactName: env.ARTIFACT_NAME,
    sha256: env.ARTIFACT_SHA256,
    sizeBytes: env.ARTIFACT_SIZE ? Number(env.ARTIFACT_SIZE) : null,
    sourceSha: env.SOURCE_SHA,
    requestCommit: env.REQUEST_COMMIT,
    requestRef: env.REQUEST_REF,
    packageId: app.android.package,
    versionName: app.version,
    versionCode: Number(env.VERSION_CODE),
    signing: env.SIGNING || 'debug',
    channel: env.CHANNEL || 'preview',
    timestamp: new Date().toISOString(),
    runId: env.RUN_ID,
    runUrl: env.RUN_URL,
    fingerprint: env.FINGERPRINT,
    toolchain: readToolchain(env),
  });
  const out = env.PROVENANCE_OUT || 'provenance.json';
  writeFileSync(out, JSON.stringify(rec, null, 2) + '\n');
  console.log(`wrote ${out}`);
  return rec;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
