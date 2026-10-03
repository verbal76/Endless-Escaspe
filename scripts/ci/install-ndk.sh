#!/bin/bash
# Installs the NDK version React Native pins before Gradle runs, with
# retries. Otherwise the Android Gradle plugin downloads it on demand
# inside the build, and a truncated download fails the whole build:
# render-check run 16 (133f35b) died with "Install NDK (Side by side)
# 27.1.12297006 failed ... ZipException: Archive is not a ZIP archive"
# with no project change (the next commit's run passed).
set -uo pipefail
NDK=$(sed -n 's/^ndkVersion = "\(.*\)"/\1/p' node_modules/react-native/gradle/libs.versions.toml)
if [ -z "$NDK" ]; then
  echo "could not read ndkVersion from react-native; leaving the NDK to Gradle"
  exit 0
fi
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
SDKMANAGER=$(ls "$SDK"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1)
if [ -z "$SDKMANAGER" ]; then
  echo "no sdkmanager under '$SDK'; leaving the NDK to Gradle"
  exit 0
fi
DIR="$SDK/ndk/$NDK"
for attempt in 1 2 3; do
  if [ -f "$DIR/source.properties" ]; then
    echo "NDK $NDK present at $DIR"
    exit 0
  fi
  echo "installing NDK $NDK (attempt $attempt)"
  sudo rm -rf "$DIR"
  yes | "$SDKMANAGER" --install "ndk;$NDK" >/dev/null && [ -f "$DIR/source.properties" ] && continue
  sleep $((attempt * 15))
done
[ -f "$DIR/source.properties" ] && { echo "NDK $NDK present at $DIR"; exit 0; }
echo "::error::could not install NDK $NDK after 3 attempts (network?)"
exit 1
