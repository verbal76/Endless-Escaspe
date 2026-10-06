import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PLAY_REQUIRED_TARGET_SDK } from '../src/util/aboutInfo';

const require = createRequire(import.meta.url);
const appConfig = require('../app.config.js') as {
  (a: { config: Record<string, unknown> }): { extra: { release: { targetSdk?: number; signing?: string; gitSha?: string } } };
  readSdkLevels: (root: string) => { minSdk: number | null; targetSdk: number | null; compileSdk: number | null };
};

test('play target: the React Native template this build compiles against meets the verified Play API requirement', () => {
  const sdk = appConfig.readSdkLevels(process.cwd());
  assert.ok(sdk.targetSdk, 'targetSdk readable from react-native/gradle/libs.versions.toml');
  assert.ok(
    (sdk.targetSdk as number) >= PLAY_REQUIRED_TARGET_SDK,
    `targetSdk ${sdk.targetSdk} is below the Play requirement ${PLAY_REQUIRED_TARGET_SDK}: this is a Play API compliance finding - classify (Class A/B) before changing anything`,
  );
  assert.ok((sdk.compileSdk as number) >= (sdk.targetSdk as number));
  assert.ok((sdk.minSdk as number) <= (sdk.targetSdk as number));
});

test('app config: release block carries the target SDK; signing only when known; unreadable template is tolerated', () => {
  const saved = { ...process.env };
  try {
    delete process.env.EE_BUILD_NUMBER;
    delete process.env.EE_SIGNING_STATE;
    delete process.env.EE_GIT_SHA;
    const local = appConfig({ config: { android: {}, extra: {} } }).extra.release;
    assert.equal(typeof local.targetSdk, 'number');
    assert.equal(local.signing, undefined, 'a local config does not claim a signing state');
    process.env.EE_BUILD_NUMBER = '14';
    assert.equal(appConfig({ config: { android: {}, extra: {} } }).extra.release.signing, 'debug', 'CI APK line = debug keystore');
    process.env.EE_SIGNING_STATE = 'production';
    assert.equal(appConfig({ config: { android: {}, extra: {} } }).extra.release.signing, 'production');
    process.env.EE_SIGNING_STATE = 'bogus';
    assert.equal(appConfig({ config: { android: {}, extra: {} } }).extra.release.signing, 'debug', 'invalid value ignored');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  assert.deepEqual(appConfig.readSdkLevels('/nonexistent'), { minSdk: null, targetSdk: null, compileSdk: null });
});
