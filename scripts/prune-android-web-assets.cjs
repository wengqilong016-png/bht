const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const targets = [
  path.join(repoRoot, 'dist', 'downloads'),
  path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'downloads'),
];

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed Android-only web asset directory: ${path.relative(repoRoot, target)}`);
}
