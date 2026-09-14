#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEFAULT_SDK_DIR="${HOME}/.cache/crew-forge-android-sdk"
SDK_DIR="${CREW_FORGE_ANDROID_SDK:-${ANDROID_HOME:-$DEFAULT_SDK_DIR}}"

if [ -n "${CREW_FORGE_AAPT2:-}" ]; then
  AAPT2_BIN="$CREW_FORGE_AAPT2"
elif [ -n "${PREFIX:-}" ]; then
  AAPT2_BIN="$PREFIX/bin/aapt2"
else
  AAPT2_BIN="/data/data/com.termux/files/usr/bin/aapt2"
fi

if [ ! -f "$SDK_DIR/platforms/android-35/android.jar" ]; then
  printf 'Android SDK Platform 35 not found under: %s\n' "$SDK_DIR" >&2
  exit 1
fi

if [ ! -x "$AAPT2_BIN" ]; then
  printf 'ARM64 aapt2 not found or not executable: %s\n' "$AAPT2_BIN" >&2
  exit 1
fi

cd "$ROOT_DIR"
ANDROID_HOME="$SDK_DIR" ANDROID_SDK_ROOT="$SDK_DIR" \
  gradle :app:assembleDebug \
    -Pandroid.builder.sdkDownload=false \
    -Pandroid.aapt2FromMavenOverride="$AAPT2_BIN" \
    --console=plain

APK_PATH="$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
printf 'APK ready: %s\n' "$APK_PATH"
