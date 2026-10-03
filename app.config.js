// Dynamic layer over app.json. Expo passes the static app.json config
// in; this adds release metadata that only CI knows:
//
//   EE_BUILD_NUMBER  -> android.versionCode (APK builds: the
//                       apk-build.yml run number, matches the
//                       GitHub release tag build-N)
//   EE_GIT_SHA       -> extra.release.gitSha (source commit)
//   EE_OTA_SEQUENCE  -> extra.release.otaSequence (OTA publishes:
//                       the eas-update.yml run number)
//
// extra.* is carried inside the embedded manifest (APK builds) and
// inside every published update's manifest, so the running app can
// report exactly which build / update / commit it is (see
// src/util/releaseInfo.ts). Locally, with none of these set, the
// config is just app.json.
const INT = /^\d+$/;
const SHA = /^[0-9a-f]{7,40}$/i;
const CHANNEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;

module.exports = ({ config }) => {
  const env = process.env;
  const release = {};
  if (SHA.test(env.EE_GIT_SHA || '')) release.gitSha = env.EE_GIT_SHA.toLowerCase();
  if (INT.test(env.EE_OTA_SEQUENCE || '')) release.otaSequence = Number(env.EE_OTA_SEQUENCE);
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
