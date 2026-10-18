#!/usr/bin/env bash
# Builds a signed release APK of NOVA for Android from apps/mobile.
# The signing key lives outside the repository: ~/.nova/android/keystore.properties
# (storeFile, storePassword, keyAlias, keyPassword). Nothing secret is printed.
# Requires: Android SDK, a JDK 17–21 (Android Studio's bundled JBR works).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/mobile"
PROPS="${NOVA_ANDROID_KEYSTORE:-$HOME/.nova/android/keystore.properties}"
: "${JAVA_HOME:=/c/Program Files/Android/Android Studio/jbr}"
: "${ANDROID_HOME:=$LOCALAPPDATA/Android/Sdk}"
export JAVA_HOME ANDROID_HOME

[[ -f "$PROPS" ]] || { echo "missing $PROPS (see docs/release/mobile.md)" >&2; exit 1; }
prop() { grep "^$1=" "$PROPS" | cut -d= -f2-; }

cd "$APP"
# Stop any Metro dev server first: on Windows it keeps files in node_modules open.
[[ "${NOVA_SKIP_INSTALL:-0}" == 1 ]] || npm ci --no-audit --no-fund
CI=1 npx expo prebuild --platform android --no-install --clean

cd android
# The wrapper's 10 s default fails on slow links while fetching Gradle.
sed -i 's/^networkTimeout=.*/networkTimeout=600000/' gradle/wrapper/gradle-wrapper.properties
# Reuse an already downloaded "-all" distribution of the same Gradle version if there is one.
DIST="$(grep '^distributionUrl=' gradle/wrapper/gradle-wrapper.properties | sed 's/.*distributions\///; s/-bin.zip//')"
if ls "$HOME/.gradle/wrapper/dists/$DIST-all/"*/"$DIST-all.zip.ok" >/dev/null 2>&1; then
  sed -i "s/$DIST-bin.zip/$DIST-all.zip/" gradle/wrapper/gradle-wrapper.properties
fi
./gradlew --no-daemon assembleRelease \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a \
  -Pandroid.injected.signing.store.file="$(prop storeFile)" \
  -Pandroid.injected.signing.store.password="$(prop storePassword)" \
  -Pandroid.injected.signing.key.alias="$(prop keyAlias)" \
  -Pandroid.injected.signing.key.password="$(prop keyPassword)"

VERSION="$(node -p "require('$APP/app.json').expo.version")"
OUT="$ROOT/target/mobile"
mkdir -p "$OUT"
cp app/build/outputs/apk/release/app-release.apk "$OUT/NOVA-$VERSION-android.apk"
( cd "$OUT" && sha256sum "NOVA-$VERSION-android.apk" > "NOVA-$VERSION-android.apk.sha256" )
echo "built $OUT/NOVA-$VERSION-android.apk"
