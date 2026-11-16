#!/bin/bash
# Shared by the jobs in ios.yml: select the newest Xcode and boot a simulator, writing its udid to
# the step's outputs.
set -euo pipefail

# The image ships several Xcodes and defaults to an older one; the newest release carries the
# newest iOS simulator. Betas are skipped unless nothing else is installed.
xcode=$(ls -d /Applications/Xcode_*.app | grep -vi beta | sort -V | tail -1)
[ -n "$xcode" ] || xcode=$(ls -d /Applications/Xcode_*.app | sort -V | tail -1)
sudo xcode-select -s "$xcode"
xcodebuild -version

# Picked at run time so a new image with different simulators does not break the job: iPhone 17
# Pro when it exists (the device the tests were written on), otherwise the first available iPhone.
# Booting first keeps the first launch inside its timeout.
json=$(xcrun simctl list devices available -j)
udid=$(echo "$json" | jq -r '[.devices[][] | select(.name == "iPhone 17 Pro")][0].udid // empty')
[ -n "$udid" ] || udid=$(echo "$json" | jq -r '[.devices[][] | select(.name | startswith("iPhone"))][0].udid')
name=$(echo "$json" | jq -r --arg u "$udid" '.devices[][] | select(.udid == $u) | .name')
echo "using $name ($udid)"
echo "udid=$udid" >> "$GITHUB_OUTPUT"
xcrun simctl bootstatus "$udid" -b
