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

# Poll logcat instead of sleeping a fixed time. A launch is done once
# the render audit has reached its verdict (a clean audit, or the last
# of its 1 + 3 attempts, see RENDER_AUDIT_RETRIES in Game.tsx) or the
# app crashed. The timeouts are ceilings for slow emulators, not the
# expected duration.
POLL=5
audit_settled() {
  local f=$1 audits
  grep -q "FATAL EXCEPTION" "$f" && return 0
  audits=$(grep -c '\[render-audit\] {' "$f")
  if [ "$audits" -ge 1 ] && grep '\[render-audit\] {' "$f" | grep -q '"problems":\[\]'; then
    return 0
  fi
  [ "$audits" -ge 4 ]
}
# wait_for_audit <logcat file> <timeout s>: dumps logcat into the file
# until audit_settled or the timeout (the checker then reports what is
# missing).
#
# Only this launch's process is read (logcat --pid): `logcat -c` does
# not reliably drop lines the previous process wrote just before its
# force-stop, and a stale render-audit line used to "settle" the second
# launch instantly with none of its boot lines in the file.
wait_for_audit() {
  local f=$1 limit=$2 waited=0 pid=""
  while :; do
    if [ -z "$pid" ]; then
      pid=$(adb shell pidof "$PKG" | tr -d '\r' | awk '{print $1}')
      # Never the previous launch's process (if force-stop was slow).
      [ -n "$pid" ] && [ "$pid" = "${STALE_PID:-}" ] && pid=""
    fi
    if [ -n "$pid" ]; then
      adb logcat -d --pid="$pid" > "$f"
    else
      : > "$f"
    fi
    if [ -n "$pid" ] && audit_settled "$f"; then
      echo "launch settled after ~${waited}s (pid $pid, $f)"
      return 0
    fi
    if [ "$waited" -ge "$limit" ]; then
      echo "TIMEOUT: no render-audit verdict within ${limit}s ($f)"
      return 1
    fi
    sleep "$POLL"
    waited=$((waited + POLL))
  done
}
# The package of the activity in the foreground (empty if unknown).
resumed_pkg() {
  adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' \
    | grep -m1 -E 'mResumedActivity|topResumedActivity' | grep -oE '[A-Za-z0-9_.]+/' | head -1 | tr -d '/'
}
app_in_front() { [ "$(resumed_pkg)" = "$PKG" ]; }
app_not_in_front() { ! app_in_front; }
app_running() { [ -n "$(adb shell pidof "$PKG" | tr -d '\r')" ]; }
app_stopped() { ! app_running; }
# wait_until <timeout s> <function>: polls every second.
wait_until() {
  local limit=$1 fn=$2 waited=0
  until "$fn"; do
    [ "$waited" -ge "$limit" ] && return 1
    sleep 1
    waited=$((waited + 1))
  done
}

adb logcat -c
launch
wait_for_audit "$OUT/logcat-launch1.txt" 240
adb exec-out screencap -p > "$OUT/launch1.png"
STALE_PID=$(adb shell pidof "$PKG" | tr -d '\r' | awk '{print $1}')
adb shell am force-stop "$PKG"
wait_until 15 app_stopped || echo "note: process still listed 15s after force-stop"

adb logcat -c
launch
wait_for_audit "$OUT/logcat-launch2.txt" 300
adb exec-out screencap -p > "$OUT/launch2.png"

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
wait_until 20 app_not_in_front || echo "note: could not confirm the app went to the background"
launch
wait_until 30 app_in_front || echo "note: could not confirm the app came back to the foreground"
# Watch the resumed app for a few seconds; stop early on a crash.
for _ in 1 2 3 4 5; do
  sleep 2
  adb logcat -d | grep -q "FATAL EXCEPTION" && break
done
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
