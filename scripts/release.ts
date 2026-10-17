// Publishes every package whose current version isn't on npm yet.
// Runs in GitHub Actions after the "Version packages" pull request is merged.
// Can also run locally after `bun run version-packages` (npm then asks for 2FA).
// bun packs (turns `workspace:^` into real versions), npm publishes (handles login and 2FA).
import { $ } from 'bun';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REGISTRY = 'https://registry.npmjs.org/';

await $`bun run build`;
await $`bun run typecheck`;

const outDir = await mkdtemp(join(tmpdir(), 'expo-kit-release-'));
const published: { id: string; dir: string; version: string }[] = [];

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
  published.push({ id, dir, version: pkg.version });
}

const tags = published.map((p) => p.id);
console.log(tags.length ? `\nPublished: ${tags.join(', ')}` : '\nNothing to publish.');
if (tags.length) {
  if (process.env.CI) {
    await $`git push origin ${tags}`;
    // One GitHub release per package, with its changelog entry as the notes.
    for (const { id, dir, version } of published) {
      const notes = await changelogEntry(dir, version);
      await $`gh release create ${id} --title ${id} --notes ${notes} --verify-tag`;
    }
  } else {
    console.log('Push the tags with: git push --tags');
  }
}

// The "## <version>" section of a package's CHANGELOG.md, without the heading.
async function changelogEntry(dir: string, version: string) {
  const changelog = await Bun.file(join('packages', dir, 'CHANGELOG.md')).text();
  const start = changelog.indexOf(`\n## ${version}\n`);
  if (start === -1) return '';
  const body = changelog.slice(start + `\n## ${version}\n`.length);
  const end = body.indexOf('\n## ');
  return (end === -1 ? body : body.slice(0, end)).trim();
}
