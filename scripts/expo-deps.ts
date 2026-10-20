// Moves the playground and the packages to the library versions Expo recommends for the current SDK.
// Runs every Monday in GitHub Actions (expo-deps.yml), which opens a pull request when anything changed.
// Can also run locally: `bun scripts/expo-deps.ts`.
// Peer ranges (`^58.0.0`) already cover the whole SDK, so they stay. A newer SDK is only reported
// (as `new-sdk` in $GITHUB_OUTPUT), that upgrade is done by hand (see CONTRIBUTING.md, Versions).
import { $ } from 'bun';
import { appendFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const PLAYGROUND = 'apps/playground';

const playgroundFile = join(PLAYGROUND, 'package.json');
const sdk = major((await Bun.file(playgroundFile).json()).dependencies.expo);

// 1. Newest expo within the SDK. Its list of recommended versions comes with it.
const published = [JSON.parse(await $`npm view expo@^${sdk} version --json`.text())].flat() as string[];
const newest = published.sort(Bun.semver.order).at(-1);
await $`bunx expo install expo@~${newest}`.cwd(PLAYGROUND);

// 2. The playground's Expo libraries to the recommended versions.
await $`bunx expo install --fix`.cwd(PLAYGROUND);

// 3. The same versions for the packages' devDependencies, which they build and type check against.
const playground = await Bun.file(playgroundFile).json();
const recommended: Record<string, string> = await Bun.file('node_modules/expo/bundledNativeModules.json').json();
const wanted: Record<string, string> = { ...recommended, expo: playground.dependencies.expo };
for (const name of Object.keys(wanted)) {
  // The playground's version, so packages and playground always match.
  const version = playground.dependencies[name] ?? playground.devDependencies?.[name];
  if (version) wanted[name] = version;
}

for (const dir of await readdir('packages')) {
  const file = join('packages', dir, 'package.json');
  const pkg = await Bun.file(file).json();
  let changed = false;
  for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
    if (wanted[name] && wanted[name] !== version) {
      console.log(`${pkg.name}: ${name} ${version} → ${wanted[name]}`);
      pkg.devDependencies[name] = wanted[name];
      changed = true;
    }
  }
  if (changed) await Bun.write(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

// Fresh install: updating in place leaves extra copies under expo/node_modules, which expo-doctor flags.
await $`rm -rf node_modules ${PLAYGROUND}/node_modules`;
await $`bun install`;

// 4. A newer SDK only gets reported.
const latest = major((await $`npm view expo dist-tags.latest`.text()).trim());
if (latest > sdk) {
  console.log(`\nExpo SDK ${latest} is out (this repo is on ${sdk}). Upgrade by hand, see CONTRIBUTING.md.`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `new-sdk=${latest}\n`);
}

function major(range: string) {
  return Number(range.replace(/^[~^]/, '').split('.')[0]);
}
