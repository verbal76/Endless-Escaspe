#!/bin/bash
# Runs inside the Android emulator job: installs the APK, launches it
# twice (cold start, then a restart) and collects logcat + screenshots
# for check-render-audit.mjs.
set -uo pipefail
PKG=com.verbal76.endlessescaspe
OUT=render-check
mkdir -p "$OUT"
adb install -r -g app.apk
launch() { adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null; }

adb logcat -c
launch
sleep 90
adb exec-out screencap -p > "$OUT/launch1.png"
adb logcat -d > "$OUT/logcat-launch1.txt"
adb shell am force-stop "$PKG"
sleep 3

adb logcat -c
launch
sleep 120
adb exec-out screencap -p > "$OUT/launch2.png"
adb logcat -d > "$OUT/logcat-launch2.txt"

echo "--- device ---"
adb shell getprop ro.product.cpu.abilist
adb shell getprop ro.dalvik.vm.native.bridge
for f in "$OUT/logcat-launch1.txt" "$OUT/logcat-launch2.txt"; do
  echo "--- crash trace in $f ---"
  grep -A 30 "FATAL EXCEPTION" "$f" | cut -c1-300 | head -40 || true
done
echo "--- app log lines (launch 1) ---"
grep -E "\[release\]|\[textures\]|\[font\]|\[render-audit\]|FATAL EXCEPTION|ReactNativeJS.*(Error|Warn)" "$OUT/logcat-launch1.txt" | cut -c1-2500 || true
echo "--- app log lines (launch 2) ---"
grep -E "\[release\]|\[textures\]|\[font\]|\[render-audit\]|FATAL EXCEPTION|ReactNativeJS.*(Error|Warn)" "$OUT/logcat-launch2.txt" | cut -c1-2500 || true
node scripts/ci/check-render-audit.mjs "$OUT/logcat-launch2.txt"
