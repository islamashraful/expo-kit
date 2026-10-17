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

## Rules

- No secret keys in packages. Apps pass their own keys in.
- Keep packages in step with the Expo SDK version used by the playground (see Versions).
- Only put code in `core` when more than one package needs it.

## Planned

- `apple-ai`: native Swift module
