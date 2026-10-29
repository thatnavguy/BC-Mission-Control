// Bumps the version across package.json files and rotates the CHANGELOG
// "Unreleased" section. Usage: npm run version:bump -- 1.1.0
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run version:bump -- <major.minor.patch>   e.g. npm run version:bump -- 1.1.0');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

for (const rel of ['package.json', 'server/package.json', 'web/package.json']) {
  const file = path.join(root, rel);
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`${rel} -> ${version}`);
}

const changelogPath = path.join(root, 'CHANGELOG.md');
let changelog = fs.readFileSync(changelogPath, 'utf8');
if (!changelog.includes('## [Unreleased]')) {
  console.error('CHANGELOG.md has no "## [Unreleased]" section.');
  process.exit(1);
}
if (changelog.includes(`## [${version}]`)) {
  console.error(`CHANGELOG.md already has a [${version}] section.`);
  process.exit(1);
}
changelog = changelog.replace(
  '## [Unreleased]',
  `## [Unreleased]\n\n## [${version}] - ${today}`
);
fs.writeFileSync(changelogPath, changelog);
console.log(`CHANGELOG.md: Unreleased -> [${version}] - ${today}`);

console.log('');
console.log('Next steps:');
console.log('  1. Review the CHANGELOG.md diff');
console.log(`  2. Commit:  git commit -am "Release ${version}"`);
console.log(`  3. Tag:     git tag v${version} && git push && git push --tags`);
console.log('  4. The release workflow builds and attaches BCMissionControl.exe.');
