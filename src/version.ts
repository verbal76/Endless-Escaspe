// Single source of truth for the on-device "About" panel.
//
// BUILD_VERSION reflects the APK currently installed: bumped only when
// we ship a new EAS build (a new APK has to be installed to see the
// change).
//
// OTA_VERSION reflects the JavaScript bundle: bumped on every push
// that ships as an OTA update via eas-update.yml. After the kitchen-
// sink rebuild lands and you install build #2, this string is what
// proves OTA flow finally works end-to-end: any push that bumps it
// should be visible in About after a force-quit + reopen, no install.

export const BUILD_VERSION = 'build #2 · kitchen-sink';
export const OTA_VERSION = 'OTA #46 · police 2x, firetruck 3x, 80/20 weighting';
