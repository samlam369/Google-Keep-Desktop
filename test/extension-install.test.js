const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const extension = 'chrome-google-keep-full-screen';
const installer = path.join(__dirname, '..', 'install-extension.js');
// Permit only local fixture remotes. No GitHub access is needed by these tests.
const env = { ...process.env, GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0' };

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function init(cwd) {
  fs.mkdirSync(cwd);
  git(cwd, 'init', '-b', 'master');
  git(cwd, 'config', 'user.name', 'Extension Test');
  git(cwd, 'config', 'user.email', 'extension-test@example.invalid');
  git(cwd, 'config', 'commit.gpgsign', 'false');
}

function install(cwd, ...args) {
  return spawnSync(process.execPath, [path.join(cwd, 'install-extension.js'), ...args], {
    cwd, env, encoding: 'utf8', timeout: 30000,
  });
}

function succeeds(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error || ''}`);
}

test('extension version management with local Git repositories', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keep extension test '));
  // Only remove this test's uniquely created temporary directory.
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  const upstream = path.join(root, 'fork');
  init(upstream);
  fs.writeFileSync(path.join(upstream, 'manifest.json'), '{"version":"1.0"}\n');
  git(upstream, 'add', 'manifest.json');
  git(upstream, 'commit', '-m', 'fixture version one');
  const pinned = git(upstream, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(upstream, 'manifest.json'), '{"version":"2.0"}\n');
  git(upstream, 'add', 'manifest.json');
  git(upstream, 'commit', '-m', 'fixture version two');
  const latest = git(upstream, 'rev-parse', 'HEAD');

  const source = path.join(root, 'app source');
  init(source);
  fs.copyFileSync(installer, path.join(source, 'install-extension.js'));
  git(source, 'submodule', 'add', '-b', 'master', upstream, extension);
  git(path.join(source, extension), 'checkout', '--detach', pinned);
  git(source, 'add', '.gitmodules', 'install-extension.js', extension);
  git(source, 'commit', '-m', 'fixture pinned dependency');

  function clone(name) {
    const cwd = path.join(root, name);
    git(root, 'clone', '--no-local', source, cwd);
    return cwd;
  }

  await t.test('fresh installation checks out the pin, not the newer master', () => {
    const cwd = clone('fresh app');
    succeeds(install(cwd));
    assert.equal(git(path.join(cwd, extension), 'rev-parse', 'HEAD'), pinned);
    assert.equal(git(cwd, 'status', '--porcelain'), '');
    succeeds(install(cwd));
    assert.equal(git(cwd, 'status', '--porcelain'), '');
  });

  await t.test('adopts an existing standalone clone without losing its branch', () => {
    const cwd = clone('legacy app');
    git(cwd, 'clone', upstream, extension);
    succeeds(install(cwd));
    assert.equal(git(path.join(cwd, extension), 'rev-parse', 'HEAD'), pinned);
    assert.equal(git(path.join(cwd, extension), 'rev-parse', 'master'), latest);
    assert.equal(git(cwd, 'status', '--porcelain'), '');
  });

  await t.test('explicit upgrade uses master, leaves the index unchanged, and can roll back', () => {
    const cwd = clone('upgrade app');
    succeeds(install(cwd, '--remote'));
    assert.equal(git(path.join(cwd, extension), 'rev-parse', 'HEAD'), latest);
    assert.match(git(cwd, 'ls-files', '--stage', extension), new RegExp(pinned));
    succeeds(install(cwd));
    assert.equal(git(path.join(cwd, extension), 'rev-parse', 'HEAD'), pinned);
  });

  await t.test('installation follows a deliberately staged new pointer', () => {
    const cwd = clone('staged app');
    succeeds(install(cwd, '--remote'));
    git(cwd, 'add', extension);
    git(path.join(cwd, extension), 'checkout', '--detach', pinned);
    succeeds(install(cwd));
    assert.equal(git(path.join(cwd, extension), 'rev-parse', 'HEAD'), latest);
  });

  await t.test('local edits and untracked files block both installation and upgrade', () => {
    const cwd = clone('dirty app');
    succeeds(install(cwd));
    const extDir = path.join(cwd, extension);
    fs.writeFileSync(path.join(extDir, 'manifest.json'), 'local edit\n');
    for (const args of [[], ['--remote']]) {
      const result = install(cwd, ...args);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /local changes/);
      assert.equal(git(extDir, 'rev-parse', 'HEAD'), pinned);
      assert.equal(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'), 'local edit\n');
    }
    git(extDir, 'restore', 'manifest.json');
    fs.writeFileSync(path.join(extDir, 'local-notes.txt'), 'keep this\n');
    assert.match(install(cwd, '--remote').stderr, /local changes/);
    assert.equal(fs.readFileSync(path.join(extDir, 'local-notes.txt'), 'utf8'), 'keep this\n');
  });

  await t.test('missing Git metadata fails instead of cloning an unpinned version', () => {
    const cwd = path.join(root, 'archive app');
    fs.mkdirSync(cwd);
    fs.copyFileSync(installer, path.join(cwd, 'install-extension.js'));
    const result = install(cwd);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Git clone/);
    assert.equal(fs.existsSync(path.join(cwd, extension)), false);
  });
});
