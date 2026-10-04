# API 36 native qualification line

Branch `claude/api36-native-qualification`, based on the live branch
(02e13eb, OTA 131, runtime 0.2.1), which it does not touch.

Incorporated (merge commits, no other changes to gameplay):
- `claude/hold-native-batch` (PR #5): version/runtime 0.3.0, blocked permissions,
  expo-navigation-bar, worklets pin, trimmed eas.json, native fingerprint 0.3.0.
- `claude/hold-infra-ota-about-splash` (PR #6): OTA safe-point activation,
  applying-update overlay, Settings > About, saves backup, studio splash (now enabled with the canonical logo).

Excluded on purpose: ci-hardening (#4), scenarios (#3), ledger docs (#2).

Package stays `com.verbal76.endlessescaspe` (rename deferred). Signing stays the
template debug keystore. Build with a manual `APK Build` dispatch on this branch:
the run publishes a *prerelease* `build-N` and an artifact, never an OTA, and
`scripts/ci/verify-apk.sh` inspects the real APK (package, versionCode,
targetSdk, permissions, signing, 16 KB alignment) and compares the signing
certificate with Build 13.
