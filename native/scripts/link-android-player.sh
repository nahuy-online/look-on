#!/usr/bin/env bash
# Post-init script: copies player plugin Kotlin classes into the generated
# Android project and wires up the Gradle dependency.
#
# Run this AFTER `cargo tauri android init` and BEFORE `cargo tauri android dev/build`.
#
# Usage (from native/src-tauri/):
#   bash ../scripts/link-android-player.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_Tauri_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/src-tauri"
ANDROID_DIR="$SRC_Tauri_DIR/gen/android"

if [ ! -d "$ANDROID_DIR" ]; then
  echo "ERROR: $ANDROID_DIR not found."
  echo "Run 'cargo tauri android init' first."
  exit 1
fi

echo "=== Linking player plugin to Android project ==="

# 1. Copy the player Android library module into the generated project
PLAYER_SRC="$SRC_Tauri_DIR/android-plugins/player/android"
PLAYER_DST="$ANDROID_DIR/player"

if [ ! -d "$PLAYER_SRC" ]; then
  echo "ERROR: player plugin source not found at $PLAYER_SRC"
  exit 1
fi

echo "Copying player module → $PLAYER_DST"
rm -rf "$PLAYER_DST"
cp -r "$PLAYER_SRC" "$PLAYER_DST"

# 2. Add the player module to settings.gradle
SETTINGS_FILE="$ANDROID_DIR/settings.gradle"
if [ -f "$SETTINGS_FILE" ]; then
  if ! grep -q "include ':player'" "$SETTINGS_FILE"; then
    echo "" >> "$SETTINGS_FILE"
    echo "include ':player'" >> "$SETTINGS_FILE"
    echo "Added ':player' to settings.gradle"
  else
    echo "':player' already in settings.gradle"
  fi
fi

# 3. Add the player dependency to app/build.gradle
APP_BUILD="$ANDROID_DIR/app/build.gradle"
if [ -f "$APP_BUILD" ]; then
  if ! grep -q "implementation project(':player')" "$APP_BUILD"; then
    sed -i '/^dependencies {/a\    implementation project(":player")' "$APP_BUILD"
    echo "Added 'implementation project(':player')' to app/build.gradle"
  else
    echo "':player' dependency already in app/build.gradle"
  fi
fi

echo ""
echo "=== Done! ==="
echo "Player plugin is now linked to the Android project."
echo "You can now run: cargo tauri android dev"
