// Publishes every package whose current version isn't on npm yet.
// Run `bun run version-packages` first to bump versions.
// bun packs (turns `workspace:^` into real versions), npm publishes (handles login and 2FA).
import { $ } from 'bun';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REGISTRY = 'https://registry.npmjs.org/';

await $`bun run build`;
await $`bun run typecheck`;

const outDir = await mkdtemp(join(tmpdir(), 'expo-kit-release-'));
const published: string[] = [];

// core first, the other packages depend on it.
const dirs = (await readdir('packages')).sort((a, b) => (a === 'core' ? -1 : b === 'core' ? 1 : a.localeCompare(b)));

for (const dir of dirs) {
  const pkg = await Bun.file(join('packages', dir, 'package.json')).json();
  if (pkg.private) continue;
  const id = `${pkg.name}@${pkg.version}`;

  const existing = await $`npm view ${id} version --registry ${REGISTRY}`.quiet().nothrow();
  if (existing.exitCode === 0 && existing.stdout.toString().trim()) {
    console.log(`skip ${id} (already on npm)`);
    continue;
  }

  const packDir = join(outDir, dir);
  await $`bun pm pack --destination ${packDir}`.cwd(join('packages', dir)).quiet();
  const [tarball] = await readdir(packDir);
  // Connected to the terminal, so npm can show the login link and wait for 2FA.
  const publish = Bun.spawn(['npm', 'publish', join(packDir, tarball), '--access', 'public', '--registry', REGISTRY], {
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  if ((await publish.exited) !== 0) {
    console.error(`\nFailed to publish ${id}. Run \`bun run release\` again, it skips what's already on npm.`);
    process.exit(1);
  }
  await $`git tag ${id}`;
  published.push(id);
}

console.log(published.length ? `\nPublished: ${published.join(', ')}` : '\nNothing to publish.');
if (published.length) console.log('Push the tags with: git push --tags');
