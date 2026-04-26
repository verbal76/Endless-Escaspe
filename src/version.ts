// Single source of truth for the on-device "About" panel.
//
// BUILD_VERSION reflects the APK currently installed: bumped only when
// we ship a new EAS build (a new APK has to be installed to see the
// change).
//
// OTA_VERSION reflects the JavaScript bundle: bumped on every push
// that ships as an OTA update via eas-update.yml. If you reopen the
// app and the OTA number here doesn't match what the on-device About
// shows, the bundle didn't apply.

export const BUILD_VERSION = 'build f045276 · renderer-rewrite';
export const OTA_VERSION = 'OTA #2 · settings-screen';
