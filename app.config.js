// Dynamic layer over app.json. Expo passes the static app.json config
// in; this adds release metadata that only CI knows:
//
//   EE_BUILD_NUMBER  -> android.versionCode (APK builds: the
//                       apk-build.yml run number, matches the
//                       GitHub release tag build-N)
//   EE_GIT_SHA       -> extra.release.gitSha (source commit)
//   EE_OTA_SEQUENCE  -> extra.release.otaSequence (OTA publishes:
//                       the eas-update.yml run number)
//   EE_SIGNING_STATE -> extra.release.signing (debug | internal | upload |
//                       production). When unset, an APK built by CI
//                       (EE_BUILD_NUMBER set) is the debug-keystore line,
//                       so it reports 'debug'; a production workflow must
//                       set it explicitly.
//   targetSdk        -> extra.release.targetSdk, read from the React
//                       Native Android template this build compiles
//                       against (node_modules/react-native/gradle/
//                       libs.versions.toml). The native-fingerprint gate
//                       guarantees an OTA's native layer equals the
//                       installed APK's, so the value is valid for both.
//
// extra.* is carried inside the embedded manifest (APK builds) and
// inside every published update's manifest, so the running app can
// report exactly which build / update / commit it is (see
// src/util/releaseInfo.ts). Locally, with none of these set, the
// config is just app.json.
const fs = require('fs');
const path = require('path');
const INT = /^\d+$/;

// The public product version ("Endless Escape v15") lives in release.json
// and nowhere else; docs/RELEASING.md explains the convention.
function readPublicVersion(root) {
  try {
    const n = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8')).publicVersion;
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
const SHA = /^[0-9a-f]{7,40}$/i;
const CHANNEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// Android SDK levels of the React Native template in node_modules
// (minSdk / targetSdk / compileSdk), or null when unreadable.
function readSdkLevels(root) {
  try {
    const toml = fs.readFileSync(path.join(root, 'node_modules/react-native/gradle/libs.versions.toml'), 'utf8');
    const get = (k) => {
      const m = toml.match(new RegExp('^' + k + '\\s*=\\s*"(\\d+)"', 'm'));
      return m ? Number(m[1]) : null;
    };
    return { minSdk: get('minSdk'), targetSdk: get('targetSdk'), compileSdk: get('compileSdk') };
  } catch {
    return { minSdk: null, targetSdk: null, compileSdk: null };
  }
}

module.exports = ({ config }) => {
  const env = process.env;
  const release = {};
  if (SHA.test(env.EE_GIT_SHA || '')) release.gitSha = env.EE_GIT_SHA.toLowerCase();
  if (INT.test(env.EE_OTA_SEQUENCE || '')) release.otaSequence = Number(env.EE_OTA_SEQUENCE);
  const publicVersion = readPublicVersion(__dirname);
  if (publicVersion) release.publicVersion = publicVersion;
  const sdk = readSdkLevels(__dirname);
  if (sdk.targetSdk) release.targetSdk = sdk.targetSdk;
  const SIGNING = /^(debug|internal|upload|production)$/;
  if (SIGNING.test(env.EE_SIGNING_STATE || '')) release.signing = env.EE_SIGNING_STATE;
  else if (INT.test(env.EE_BUILD_NUMBER || '')) release.signing = 'debug';
  const android = { ...config.android };
  if (INT.test(env.EE_BUILD_NUMBER || '')) android.versionCode = Number(env.EE_BUILD_NUMBER);
  // EE_UPDATE_CHANNEL (eas.json build.<profile>.env) picks the update
  // channel baked into a build; unset keeps app.json's `preview`, so
  // every GitHub-built APK is unchanged. See docs/native-batch.md.
  const updates = { ...config.updates };
  if (CHANNEL.test(env.EE_UPDATE_CHANNEL || '')) {
    updates.requestHeaders = { ...updates.requestHeaders, 'expo-channel-name': env.EE_UPDATE_CHANNEL };
  }
  return {
    ...config,
    android,
    updates,
    extra: { ...config.extra, release },
  };
};

module.exports.readSdkLevels = readSdkLevels;
module.exports.readPublicVersion = readPublicVersion;
