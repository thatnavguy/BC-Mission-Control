// Builds BCMissionControl.exe: bundle server with esbuild (embedding web/dist),
// generate a Node SEA blob, inject it into a copy of the current node binary.
// Requires Node 20+ on Windows; output lands in server/build/.
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const serverDir = path.resolve(__dirname, '..');
const buildDir = path.join(serverDir, 'build');
const bundlePath = path.join(buildDir, 'bc-mission-control.cjs');
const blobPath = path.join(buildDir, 'sea.blob');
const seaConfigPath = path.join(buildDir, 'sea-config.json');
const exePath = path.join(buildDir, 'BCMissionControl.exe');

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) {
  console.error(`Node 20+ is required to build the exe (you are on ${process.versions.node}).`);
  process.exit(1);
}
if (process.platform !== 'win32') {
  console.error('build-exe currently targets Windows only. Run it on Windows (or CI).');
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });

console.log('1/5 Embedding web/dist assets...');
execFileSync(process.execPath, [path.join(__dirname, 'embed-web.js')], { stdio: 'inherit' });

console.log('2/5 Bundling server with esbuild...');
require('esbuild').buildSync({
  entryPoints: [path.join(serverDir, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: `node${nodeMajor}`,
  outfile: bundlePath,
  logLevel: 'info'
});

console.log('3/5 Generating SEA blob...');
fs.writeFileSync(seaConfigPath, JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], { stdio: 'inherit' });

console.log('4/5 Copying node binary...');
fs.copyFileSync(process.execPath, exePath);

console.log('5/5 Injecting SEA blob with postject...');
execSync(
  `npx --yes postject "${exePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  { stdio: 'inherit', cwd: serverDir }
);

const sizeMB = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1);
console.log(`\nDone: ${exePath} (${sizeMB} MB)`);
console.log('State is stored in %APPDATA%\\BCMissionControl (or a "data" folder next to the exe, if one exists).');
