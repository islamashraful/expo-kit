#!/bin/sh
# Compiles the plain-Swift parts of the module (no Expo types) with a small test
# runner for macOS and runs it. The model tests need a Mac with Apple Intelligence
# on; elsewhere they are skipped. Usage: sh native-tests/run.sh
set -e
cd "$(dirname "$0")/.."
OUT="${TMPDIR:-/tmp}/expo-kit-apple-ai-tests"
xcrun swiftc -O -o "$OUT" \
  ios/ModelCore.swift \
  native-tests/Harness.swift native-tests/*Tests.swift native-tests/main.swift
"$OUT"
