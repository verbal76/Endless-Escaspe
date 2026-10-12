#!/usr/bin/env bash
# Inspect what is packaged inside the built APK (not the source tree).
# Usage: verify-apk-content.sh <apk> <expected-runtime> <fingerprint-hash>
# Appends to apk-report.txt; fails if the studio logo, the studio splash code,
# the app icon, the runtime or the native fingerprint are not as expected.
set -euo pipefail
APK=$1; RUNTIME=$2; FP=$3
OUT=apk-report.txt
say() { echo "$*" | tee -a "$OUT"; }
fail=0
say "--- packaged content"
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}
AAPT2="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)/aapt2"
# Release builds shorten resource paths (res/-5.xml), so resolve names via aapt2.
RES=$("$AAPT2" dump resources "$APK")

# Native fingerprint recorded for this runtime must equal this build's.
REC=$(node -p "require('./scripts/native-fingerprint.json')['$RUNTIME'] || ''")
if [ "$FP" = "$REC" ] && [ -n "$FP" ]; then say "native fingerprint: $FP = recorded for runtime $RUNTIME: OK"; else say "FAIL native fingerprint $FP != recorded '$REC' for runtime $RUNTIME"; fail=1; fi

# Runtime (appVersion policy): the embedded app config carries version == runtime.
CFG=$(unzip -p "$APK" assets/app.config 2>/dev/null || true)
if echo "$CFG" | grep -q "\"version\":\"$RUNTIME\"" && echo "$CFG" | grep -q '"policy":"appVersion"'; then say "runtime $RUNTIME (appVersion policy) in embedded app config: OK"; else say "FAIL embedded app config does not carry version $RUNTIME / appVersion policy"; fail=1; fi
say "embedded public version: $(echo "$CFG" | grep -o '"publicVersion":[0-9]*' | head -1)"

# Canonical studio logo packaged as an image resource (name derives from the file name).
LOGO=$(echo "$RES" | grep -i -A6 'hot_attic_games_master_logo_alpha_final' | grep -oE 'res/[^ ]+\.(png|webp)' | sort -u | head -3 || true)
if [ -n "$LOGO" ]; then
  say "studio logo packaged: $(echo "$LOGO" | tr '\n' ' ')"
  F=$(echo "$LOGO" | head -1)
  unzip -p "$APK" "$F" > logo-extracted.png
  set +e
  python3 - <<'PY' | tee -a "$OUT"
import struct, hashlib
d = open('logo-extracted.png', 'rb').read()
ok = d[:8] == b'\x89PNG\r\n\x1a\n'
w, h = struct.unpack('>II', d[16:24]) if ok else (0, 0)
ct = d[25] if ok else -1
print(f"packaged logo: png={ok} {w}x{h} colortype={ct} bytes={len(d)} sha256={hashlib.sha256(d).hexdigest()}")
canon = hashlib.sha256(open('Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png', 'rb').read()).hexdigest()
print("byte-identical to canonical file:", hashlib.sha256(d).hexdigest() == canon, "(AGP may re-encode PNGs; dimensions and RGBA are what matter)")
raise SystemExit(0 if (ok and (w, h) == (1536, 1024) and ct == 6) else 1)
PY
  rc=${PIPESTATUS[0]}
  set -e
  [ "$rc" = 0 ] || { say "FAIL packaged logo is not a 1536x1024 RGBA PNG"; fail=1; }
else
  say "FAIL canonical studio logo is not packaged in the APK"; fail=1
fi

# Studio splash code in the JS bundle (Hermes bytecode keeps string literals).
BUNDLE=$(mktemp); unzip -p "$APK" assets/index.android.bundle > "$BUNDLE"
if grep -aq 'studio-splash\] shown' "$BUNDLE" && grep -aq 'Hot Attic Games' "$BUNDLE"; then say "studio splash code in the JS bundle: OK"; else say "FAIL studio splash code not found in the JS bundle"; fail=1; fi

# App icon: the manifest's icon resolves to a file inside the APK.
ICON=$("$AAPT2" dump badging "$APK" | grep -E "^application-icon-" | tail -1 | sed "s/.*:'\(.*\)'/\1/")
say "application label/icon: $("$AAPT2" dump badging "$APK" | grep -m1 '^application-label:') icon=$ICON"
if [ -n "$ICON" ] && unzip -Z1 "$APK" | grep -qxF "$ICON"; then say "app icon packaged: $ICON: OK"; else say "FAIL app icon '$ICON' not found in the APK"; fail=1; fi

# Native libraries packaged.
NLIB=$(unzip -Z1 "$APK" | grep -c '^lib/.*\.so$' || true)
say "native libraries packaged: $NLIB"
[ "$NLIB" -ge 20 ] || { say "FAIL too few native libraries"; fail=1; }
[ "$fail" = 0 ] && say "packaged content: OK" || { say "FAIL: packaged content check"; exit 1; }
