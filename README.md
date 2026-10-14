# expo-kit

Reusable packages for my Expo apps. Each feature is its own small package, so an app only installs what it needs.

Built for Expo SDK 57. Not published to npm yet.

## Packages

| Package | What it does |
|---|---|
| `@islamashraful/core` | Shared hooks used by the other packages |

### `@islamashraful/core`

Uses only React Native, no extra native libraries.

- `useOnForeground(callback)`: runs `callback` every time the app comes back to the front.

```tsx
import { useOnForeground } from '@islamashraful/core';

useOnForeground(() => {
  refreshData();
});
```

### Planned

- `notifications`: notification permission and scheduling helpers (next up)
- `app-update`: App Store and EAS Update checks with an update sheet
- `rating`: App Store review prompt with limits
- `mail`: mail composer wrapper
- `cloudkit`, `apple-ai`: native Swift modules
- `purchases`: RevenueCat setup and paywall (brought back when needed)

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

## Adding a package

1. Copy `packages/core` to `packages/<name>` and rename it in `package.json`.
2. Native libraries the package uses go in `peerDependencies` (the app installs them with `npx expo install`).
3. To use `core` inside it, add `"@islamashraful/core": "workspace:^"` to its `dependencies`.
4. Add it to `apps/playground/package.json` as `"workspace:*"` and run `bun install`.

## Rules

- No secret keys in packages. Apps pass their own keys in.
- Keep packages in step with the Expo SDK version used by the playground.
- Only put code in `core` when more than one package needs it.
