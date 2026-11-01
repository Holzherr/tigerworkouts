#!/bin/sh
# App Store screenshots: a clean 6.9" simulator, a 9:41 status bar, seeded history, then
# AppStoreScreenshotsUITests. The PNGs land in fastlane/screenshots/en-GB/ (1320 x 2868), the
# layout fastlane deliver uploads.
set -eu
cd "$(dirname "$0")"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
DEVICE="${DEVICE:-iPhone 17 Pro Max}"
OUT=fastlane/screenshots/en-GB
UDID=$(xcrun simctl list devices available | grep -F "$DEVICE (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$UDID" ] || { echo "no simulator named $DEVICE"; exit 1; }

xcrun simctl shutdown "$UDID" 2>/dev/null || true
xcrun simctl erase "$UDID"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" >/dev/null
xcrun simctl ui "$UDID" appearance light
xcrun simctl status_bar "$UDID" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

rm -rf build/shots.xcresult build/shots
TEST_RUNNER_APPSTORE_SHOTS=1 xcodebuild -project TigerWorkouts.xcodeproj -scheme TigerWorkouts \
  -destination "id=$UDID" -resultBundlePath build/shots.xcresult \
  -only-testing:TigerWorkoutsUITests/AppStoreScreenshotsUITests test
xcrun xcresulttool export attachments --path build/shots.xcresult --output-path build/shots

mkdir -p "$OUT"
rm -f "$OUT"/*.png
# manifest.json maps each exported file to the name snap() gave it.
python3 - "$OUT" <<'EOF'
import json, shutil, sys
out = sys.argv[1]
for test in json.load(open("build/shots/manifest.json")):
    for a in test["attachments"]:
        name = a["suggestedHumanReadableName"].split("_")[0]
        shutil.copy(f"build/shots/{a['exportedFileName']}", f"{out}/iPhone69-{name}.png")
EOF
ls -1 "$OUT"
