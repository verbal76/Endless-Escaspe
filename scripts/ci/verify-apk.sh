#!/usr/bin/env bash
# Inspect a built APK (not the source config) and write apk-report.txt.
# Usage: verify-apk.sh <apk> <expected-package> <expected-versionCode> <min-target-sdk>
# Fails on: wrong package/versionCode, targetSdk below the Play requirement,
# any native library whose ELF LOAD segments are not 16 KB aligned, or an APK
# whose uncompressed .so files are not 16 KB aligned inside the zip.
set -euo pipefail
APK=$1; PKG=$2; VC=$3; MINTARGET=$4
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}
BT=$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)
echo "build-tools: $BT"
OUT=apk-report.txt
: > "$OUT"
say() { echo "$*" | tee -a "$OUT"; }

say "file: $(basename "$APK")"
say "size: $(stat -c %s "$APK") bytes"
say "sha256: $(sha256sum "$APK" | cut -d' ' -f1)"

BADGING=$("$BT/aapt2" dump badging "$APK")
say "$(echo "$BADGING" | grep -m1 '^package:')"
say "$(echo "$BADGING" | grep -E '^(sdkVersion|targetSdkVersion|compileSdkVersion)' | tr '\n' ' ')"
say "native-code: $(echo "$BADGING" | grep -m1 '^native-code:' || echo none)"
GOT_PKG=$(echo "$BADGING" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")
GOT_VC=$(echo "$BADGING" | sed -n "s/^package:.* versionCode='\([^']*\)'.*/\1/p")
GOT_TGT=$(echo "$BADGING" | sed -n "s/^targetSdkVersion:'\([0-9]*\)'.*/\1/p")
[ "$GOT_PKG" = "$PKG" ] || { say "FAIL package $GOT_PKG != $PKG"; exit 1; }
[ "$GOT_VC" = "$VC" ] || { say "FAIL versionCode $GOT_VC != $VC"; exit 1; }
[ "$GOT_TGT" -ge "$MINTARGET" ] || { say "FAIL targetSdk $GOT_TGT < $MINTARGET"; exit 1; }
say "package/versionCode/targetSdk: OK ($GOT_PKG / $GOT_VC / $GOT_TGT)"

say "--- permissions (apk)"; echo "$BADGING" | grep -E "^(uses-permission|permission)" | tee -a "$OUT"
say "--- manifest components (xmltree)"
"$BT/aapt2" dump xmltree --file AndroidManifest.xml "$APK" | grep -E "E: (activity|service|receiver|provider)|android:name|android:exported" | grep -E "E: |exported" | tee -a "$OUT" | head -80

say "--- signing"
if [ -x "$BT/apksigner" ]; then
  "$BT/apksigner" verify --verbose --print-certs "$APK" 2>&1 | tee -a "$OUT" | grep -E "Verifies|Verified using|certificate (DN|SHA-256)" || true
fi

say "--- zipalign (16 KB page check)"
if "$BT/zipalign" -c -P 16 -v 4 "$APK" > zipalign.txt 2>&1; then say "zipalign -P 16: OK"; else say "zipalign -P 16: FAIL"; grep -iE "BAD|FAIL" zipalign.txt | head -20 | tee -a "$OUT"; ZFAIL=1; fi
grep -E "\.so " zipalign.txt | head -40 | tee -a "$OUT" || true

say "--- native libraries + ELF alignment"
WORK=$(mktemp -d); unzip -q -o "$APK" 'lib/*' -d "$WORK" || true
set +e
python3 - "$WORK" "$OUT" <<'PY'
import os, struct, sys
root, out = sys.argv[1], sys.argv[2]
bad = 0; rows = []
for d, _, fs in os.walk(os.path.join(root, 'lib')):
    for f in sorted(fs):
        p = os.path.join(d, f)
        with open(p, 'rb') as fh:
            h = fh.read(64)
            if h[:4] != b'\x7fELF': continue
            is64 = h[4] == 2
            if is64:
                phoff, = struct.unpack_from('<Q', h, 32); phentsize, phnum = struct.unpack_from('<HH', h, 54)
            else:
                phoff, = struct.unpack_from('<I', h, 28); phentsize, phnum = struct.unpack_from('<HH', h, 42)
            fh.seek(phoff); aligns = []
            for _ in range(phnum):
                e = fh.read(phentsize)
                t, = struct.unpack_from('<I', e, 0)
                if t == 1:
                    aligns.append(struct.unpack_from('<Q', e, 48)[0] if is64 else struct.unpack_from('<I', e, 28)[0])
        abi = os.path.relpath(d, os.path.join(root, 'lib'))
        ok = all(a % 16384 == 0 for a in aligns) and bool(aligns)
        if not ok: bad += 1
        rows.append(f"{abi:12s} {f:40s} LOAD align={sorted(set(aligns))} {'OK' if ok else 'FAIL<16KB'}")
with open(out, 'a') as o:
    for r in rows: print(r); o.write(r + '\n')
    s = f"native libs: {len(rows)}; not 16 KB aligned: {bad}"
    print(s); o.write(s + '\n')
sys.exit(1 if bad else 0)
PY
ELF=$?
set -e
[ "${ZFAIL:-0}" = 0 ] && [ "$ELF" = 0 ] || { say "FAIL: 16 KB alignment"; exit 1; }
say "16 KB: OK"
