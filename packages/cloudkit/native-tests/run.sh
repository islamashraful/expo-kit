#!/bin/sh
# Compiles the plain-Swift parts of the module (no Expo types) with a small test
# runner for macOS and runs it. Usage: sh native-tests/run.sh
set -e
cd "$(dirname "$0")/.."
OUT="${TMPDIR:-/tmp}/expo-kit-cloudkit-tests"
xcrun swiftc -O -o "$OUT" \
  ios/SchemaModel.swift ios/RecordMapper.swift ios/LocalStore.swift ios/SyncCore.swift \
  native-tests/Harness.swift native-tests/*Tests.swift native-tests/main.swift \
  -framework CloudKit -lsqlite3
"$OUT"
