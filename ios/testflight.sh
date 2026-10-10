#!/bin/sh
# Archive the app and upload it to App Store Connect for TestFlight.
# Build numbers are bumped by App Store Connect (manageAppVersionAndBuildNumber), so no edit is needed
# between uploads. Needs the paid team signed into Xcode and the app record in App Store Connect.
set -eu
cd "$(dirname "$0")"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
rm -rf build/TigerWorkouts.xcarchive build/export
xcodebuild -project TigerWorkouts.xcodeproj -scheme TigerWorkouts -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/TigerWorkouts.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath build/TigerWorkouts.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export -allowProvisioningUpdates
