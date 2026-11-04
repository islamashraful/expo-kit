# Contributing

## Structure

```
apps/playground     Expo app for trying out every package
packages/*          The published packages
```

## Develop

Needs [bun](https://bun.sh).

```sh
bun install                 # installs everything and builds the packages
bun run playground          # starts the playground app
bun run typecheck           # type checks every package and the playground
```

The playground reads package source directly, so edits show up without rebuilding.

The playground's "cloudkit" screen is a small notes app that syncs, but only in a signed development build: `com.ashislam.expokit.playground`, container `iCloud.com.ashislam.expokit.playground`.

## Testing swiftdata on devices

The playground's "swiftdata" screen is built for testing without screenshots: every step runs from a link, and every device prints what happens to Metro (lines start with `[swiftdata <device>]`).

```sh
bun run playground                  # Metro; keep it running, the logs show up here
cd apps/playground && npx expo prebuild -p ios

# Build and install on an iPhone (needs the Apple account in Xcode → Settings → Accounts).
# -allowProvisioningUpdates lets Xcode create the profile; `expo run:ios` doesn't, and fails at signing.
xcodebuild -workspace ios/playground.xcworkspace -scheme playground -configuration Debug \
  -destination id=<device UDID> -derivedDataPath ios/build -allowProvisioningUpdates build
xcrun devicectl device install app --device <UDID> ios/build/Build/Products/Debug-iphoneos/playground.app
```

- Device UDIDs: `xcrun devicectl list devices` (iPhone) and `xcrun simctl list devices booted` (simulator). Simulator builds use `Debug-iphonesimulator`.
- Run a step on an iPhone over the cable (the phone must be unlocked; it also works in airplane mode):
  `xcrun devicectl device process launch --device <UDID> --payload-url "playground://swiftdata?action=add&id=<new value>" com.ashislam.expokit.playground`
- On the simulator: `xcrun simctl openurl <UDID> "playground://swiftdata?action=add&id=<new value>"`, then confirm "Open".
- Actions: `add`, `add100`, `shared` (same key everywhere, for conflicts), `dup` (a new fixed key per day, for duplicates), `clear`, `report` (state and history as plain text, printed to Metro). `id` must change every time, or the link counts as already handled.
- Bring the app to the front (this triggers a sync): launch another app (`com.apple.Preferences`), then the playground again. Launching it while it's already in front does nothing.
- An iPhone that was offline loses its Metro connection; restart the app with `--terminate-existing` to reconnect.
- A fresh-install test: `xcrun simctl uninstall`, then install again.

## Releasing

1. After changing a package, run `bun run changeset`. Pick the packages, the kind of change (patch = fix, minor = new feature; major only for a new Expo SDK, see Versions) and write one line about it. Commit the file it creates and push.
2. GitHub opens (or updates) a "Version packages" pull request with the new version numbers and changelogs.
3. Merge it when you want to release. GitHub publishes the new versions to npm, tags them and creates a GitHub release for each.

Publishing uses npm trusted publishing, so no npm token is stored anywhere. A new package must be published once by hand (`bun run release`, needs `npm login`) and then get a trusted publisher on npmjs.com (Settings → Trusted publisher → GitHub Actions, workflow `release.yml`).

### Versions

Versions match the Expo SDK, like Expo's own packages. 58.x is for SDK 58 only. All packages share the same major.

- Within an SDK: patch for fixes, minor for new features. Never major. Save breaking changes for the next SDK and deprecate the old API until then.
- New Expo SDK (for example 59): upgrade the playground, set the Expo peer ranges to `^59.0.0`, then add one changeset with every package as major. That turns 58.x into 59.0.0.

## Adding a package

1. Copy `packages/core` to `packages/<name>`, rename it in `package.json` and start its version at the current SDK (for example `58.0.0`).
2. Native libraries the package uses go in `peerDependencies` (the app installs them with `npx expo install`).
3. To use `core` inside it, add `"@expo-kit/core": "workspace:^"` to its `dependencies`.
4. Add it to `apps/playground/package.json` as `"workspace:*"` and run `bun install`.

## Dependency updates

Every Monday, GitHub (`expo-deps.yml`) moves the playground and the packages' devDependencies to the versions Expo recommends for the current SDK (same as `npx expo install --fix`) and opens a pull request when anything changed. Check CI and merge it. No changeset is needed.

A new Expo SDK gets an issue instead, upgrade by hand (see Versions). `posthog-react-native` and `react-native-purchases` aren't on Expo's list, check those by hand now and then.

Run it locally with `bun scripts/expo-deps.ts`.

## Rules

- No secret keys in packages. Apps pass their own keys in.
- Keep packages in step with the Expo SDK version used by the playground (see Versions).
- Only put code in `core` when more than one package needs it.

## Planned

- `apple-ai`: native Swift module
