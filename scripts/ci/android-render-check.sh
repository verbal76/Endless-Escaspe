#!/bin/bash
# Runs inside the Android emulator job: installs the APK, launches it
# twice (cold start, then a restart) and collects logcat + screenshots
# for check-render-audit.mjs.
set -uo pipefail
PKG=com.verbal76.endlessescaspe
OUT=render-check
mkdir -p "$OUT"
# Every adb call is time-limited: if the emulator disappears, adb
# otherwise waits for a device forever (run 10 hung 74 minutes until
# the job timeout) instead of failing fast with a clear message.
ADB_BIN=$(command -v adb)
adb() {
  local limit=60
  [ "$1" = install ] && limit=300
  timeout "$limit" "$ADB_BIN" "$@"
  local rc=$?
  if [ $rc -eq 124 ]; then
    echo "EMULATOR LOST: 'adb $1' did not answer within ${limit}s" >&2
  fi
  return $rc
}
if ! adb install -r -g app.apk; then
  echo "RENDER CHECK FAILED: could not install the APK"
  exit 1
fi
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
status=$?

# Lifecycle: send the app to the background and bring it back; it must
# resume (same process, no crash) rather than die or restart.
echo "--- background / foreground ---"
pid_before=$(adb shell pidof "$PKG" | tr -d '\r')
adb logcat -c
adb shell input keyevent KEYCODE_HOME
sleep 8
launch
sleep 15
adb exec-out screencap -p > "$OUT/resumed.png"
adb logcat -d > "$OUT/logcat-resume.txt"
pid_after=$(adb shell pidof "$PKG" | tr -d '\r')
echo "pid before: $pid_before  after: $pid_after"
if grep -q "FATAL EXCEPTION" "$OUT/logcat-resume.txt"; then
  grep -A 20 "FATAL EXCEPTION" "$OUT/logcat-resume.txt" | cut -c1-300 | head -25
  echo "LIFECYCLE CHECK FAILED: crash after background / foreground"
  status=1
elif [ -z "$pid_after" ] || [ "$pid_before" != "$pid_after" ]; then
  echo "LIFECYCLE CHECK FAILED: the app did not resume in the same process"
  status=1
else
  echo "LIFECYCLE CHECK OK: resumed in the same process without errors"
fi
exit $status
