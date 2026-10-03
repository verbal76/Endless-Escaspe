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
const SHA = /^[0-9a-f]{7,40}$/i;

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
  const sdk = readSdkLevels(__dirname);
  if (sdk.targetSdk) release.targetSdk = sdk.targetSdk;
  const SIGNING = /^(debug|internal|upload|production)$/;
  if (SIGNING.test(env.EE_SIGNING_STATE || '')) release.signing = env.EE_SIGNING_STATE;
  else if (INT.test(env.EE_BUILD_NUMBER || '')) release.signing = 'debug';
  const android = { ...config.android };
  if (INT.test(env.EE_BUILD_NUMBER || '')) android.versionCode = Number(env.EE_BUILD_NUMBER);
  return {
    ...config,
    android,
    extra: { ...config.extra, release },
  };
};

module.exports.readSdkLevels = readSdkLevels;
