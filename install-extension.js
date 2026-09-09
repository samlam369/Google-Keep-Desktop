const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXT_PATH = 'chrome-google-keep-full-screen';
const EXT_DIR = path.join(__dirname, EXT_PATH);

function git(args, capture = false) {
  return execFileSync('git', args, {
    cwd: __dirname,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--remote')) {
    throw new Error('Usage: node install-extension.js [--remote]');
  }
  const update = args.includes('--remote');

  // Refuse to switch versions while the extension contains local edits.
  // This also supports the standalone nested clone used by older installs.
  if (fs.existsSync(path.join(EXT_DIR, '.git'))) {
    const changes = git(['-C', EXT_PATH, 'status', '--porcelain', '--untracked-files=all'], true);
    if (changes.trim()) {
      throw new Error('The extension has local changes. Commit or stash them before installing or updating.');
    }
  }

  console.log(update
    ? 'Checking out the latest extension fork commit from master...'
    : 'Installing the extension commit pinned by this app...');
  git(['submodule', 'update', '--init', '--checkout', ...(update ? ['--remote'] : []), '--', EXT_PATH]);
  const commit = git(['-C', EXT_PATH, 'rev-parse', 'HEAD'], true).trim();
  console.log(`Extension ready at ${commit}`);
  if (update) {
    console.log('Test the app, then stage chrome-google-keep-full-screen and commit the new pointer in the app repository.');
    console.log('This updates from your fork; merging the original upstream into the fork is a separate maintenance step.');
  }
} catch (error) {
  console.error(`Extension setup failed: ${error.message}`);
  console.error('Run this from a Git clone of the app with Git installed. No forced reset or cleanup is performed.');
  process.exitCode = 1;
}
