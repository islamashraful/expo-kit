# playground

Expo app for trying out the expo-kit packages. Home lists every package, and each one opens its own test screen.

```sh
bun run playground    # from the repo root
```

Adding a test screen for a package:

1. Add the package to `package.json` as `"workspace:*"` and run `bun install`.
2. Create `src/app/<name>.tsx`.
3. Add a row to `PACKAGES` in `src/app/index.tsx` and a `Stack.Screen` in `src/app/_layout.tsx`.
