# D. Settings > About

Location: gear (top-left) -> Settings panel (main menu or pause) -> **ABOUT** button (below the settings, with the compact `v0.2.1 • Build 13 • OTA nnn` line)
-> About view (CLOSE / Android back close it first, then the panel).

Fields (`src/util/aboutInfo.ts`; values from expo-application, expo-updates, expo-constants, React Native Platform; anything unreadable is "Unavailable", never invented):
- Application: name.
- Install: package ID, version, native/runtime version, Android build (versionCode), source commit, build type (release/development), channel.
- Updates (OTA): enabled, running code (OTA / embedded / emergency fallback), update status (Up to date / Checking / Downloading / ready / Applying / failed), OTA sequence,
  update id, published/created time, OTA source commit, integrity ("verified by expo-updates before launch"), fallback reason.
- Google Play readiness: target SDK (from `extra.release.targetSdk`, injected by app.config.js from the RN template; present for builds/OTAs made from this branch on),
  Play requirement (API 36, verified 2026-10-03), Play API compliant YES/NO/UNVERIFIED, signing (`extra.release.signing`: 'debug' for the CI APK line; "Unavailable (set by the
  native build)" for builds that do not carry it, including the installed Build 13).
- Device: platform, Android version, API level, model, locale, captured-at (UTC).
- Technical: texture / font / render-audit rows, manual CHECK FOR UPDATE (diagnostics only), **COPY DIAGNOSTICS** (share sheet: Copy or send).

COPY DIAGNOSTICS = `composeAboutText()` (src/util/support.ts): plain text with every section above + Technical. It answers: what app / package / version / native build /
versionCode / runtime / OTA / channel / source SHA / target SDK / Play compliance / device. No secrets, tokens, signing material, save contents or personal data
(tests/aboutInfo.test.ts asserts the text and that no secret words appear). Existing bug-report emails keep using `composeVitalsText` unchanged.

Needs the next NATIVE build to be populated on an already-installed Build 13: nothing is required for most fields; `Target SDK` and `Signing` are read from the running
update/embedded config, so on Build 13 they appear once an OTA built from this branch is running (target SDK) - signing stays "Unavailable" until a build embeds it.
Example output (web harness, updates disabled): see the first lines of formatAboutText in tests/aboutInfo.test.ts.
