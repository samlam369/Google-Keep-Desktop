const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '..',
  'chrome-google-keep-full-screen', 'src', 'content', 'script.js'), 'utf8');

// Minimal DOM fixture: class selectors, descendant selectors, and observer delivery.
// Mutations are delivered explicitly so cold-load timing is deterministic.
function fixture({ readyState = 'loading' } = {}) {
  const observers = [];
  const events = {};
  const errors = [];
  let resolveStorage;

  function matches(el, selector) {
    return selector.split(',').some((alternative) => {
      const parts = alternative.trim().replace(/>/g, ' ').split(/\s+/);
      function simple(node, part) {
        if (part.startsWith('.')) {
          return part.slice(1).split('.').every((name) => node.classList.contains(name));
        }
        return node.tag === part;
      }
      if (!simple(el, parts.pop())) return false;
      let ancestor = el.parent;
      while (parts.length) {
        const part = parts.pop();
        while (ancestor && !simple(ancestor, part)) ancestor = ancestor.parent;
        if (!ancestor) return false;
        ancestor = ancestor.parent;
      }
      return true;
    });
  }

  function element(tag = 'div', classes = '') {
    const names = new Set(classes.split(' ').filter(Boolean));
    const el = {
      tag, children: [], parent: null, attributes: {},
      classList: {
        contains: (name) => names.has(name),
        add: (...items) => items.forEach((name) => names.add(name)),
        remove: (...items) => items.forEach((name) => names.delete(name)),
        toggle(name, force = !names.has(name)) {
          if (force) names.add(name); else names.delete(name);
          return force;
        },
      },
      append(child) { child.parent = this; this.children.push(child); return child; },
      querySelectorAll(selector) {
        return this.children.flatMap((child) => [
          ...(matches(child, selector) ? [child] : []),
          ...child.querySelectorAll(selector),
        ]);
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener() {},
      insertAdjacentElement(position, child) {
        if (position === 'beforebegin') {
          child.parent = this.parent;
          this.parent.children.splice(this.parent.children.indexOf(this), 0, child);
        } else this.append(child);
      },
    };
    return el;
  }

  const document = element('document');
  document.readyState = readyState;
  const body = document.append(element('body'));
  document.append(element('head'));
  document.createElement = element;
  const context = vm.createContext({
    document,
    window: { addEventListener: (name, callback) => { events[name] = callback; } },
    console: { log() {}, error: (...args) => errors.push(args) },
    getComputedStyle: () => ({ 'background-color': 'rgb(255, 255, 255)' }),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
      observe(target, options) { this.targets.push({ target, options }); }
    },
    chrome: {
      storage: { sync: {
        get: (_keys, callback) => { resolveStorage = callback; },
        set: (_data, callback) => { if (callback) callback(); },
      } },
      runtime: { onMessage: { addListener() {} } },
    },
  });
  vm.runInContext(script, context);

  function mutate(target, type = 'childList') {
    for (const observer of observers) {
      if (observer.targets.some((entry) => {
        if (!entry.options[type]) return false;
        let node = target;
        do {
          if (node === entry.target) return true;
          node = entry.options.subtree ? node.parent : null;
        } while (node);
        return false;
      })) observer.callback([{ type, target }]);
    }
  }

  function addToolbar(note, className = 'IZ65Hb-nK2kYb', withMore = true) {
    const toolbar = note.append(element('div', className));
    if (withMore) addMore(toolbar);
    return toolbar;
  }
  function addMore(toolbar) {
    return toolbar.append(element('div',
      'Q0hgme-LgbsSe Q0hgme-Bz112c-LgbsSe xl07Ob INgbqf-LgbsSe VIpgJd-LgbsSe'));
  }
  function addNote({ toolbar = true, toolbarClass, withMore = true, modal = false, open = true } = {}) {
    const group = body.append(element('div', 'gkA7Yd-sKfxWe ma6Yeb-r8s4j-gkA7Yd'));
    const list = group.append(element());
    const dialog = modal ? body.append(element('div',
      `VIpgJd-TUo6Hb XKSfm-L9AdLc${open ? ' eo9XGd' : ''}`)) : null;
    const container = (dialog || list).append(element('div', modal
      ? 'IZ65Hb-n0tgWb IZ65Hb-bJ69tf oT9UPb' : 'IZ65Hb-n0tgWb IZ65Hb-QQhtn'));
    const note = container.append(element('div', 'IZ65Hb-TBnied'));
    if (toolbar) addToolbar(note, toolbarClass, withMore);
    return { group, list, dialog, container, note };
  }
  return {
    body, errors, addNote, addToolbar, addMore, mutate,
    start: () => events.load(),
    async settings(value = {}) {
      assert.equal(typeof resolveStorage, 'function', 'startup must reach storage loading');
      resolveStorage(value);
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test('cold load discovers a note inserted after startup and maximizes it once', async () => {
  const page = fixture();
  page.start();
  await page.settings();
  const { note, container } = page.addNote();
  page.mutate(page.body);
  assert.equal(page.body.classList.contains('gkfs-fullscreen'), true);
  assert.equal(container.classList.contains('gkfs-observed'), true);
  assert.equal(typeof note.gkfs.toggle_fullscreen, 'function');
  page.mutate(note);
  assert.equal(note.querySelectorAll('.gkfs-toggle').length, 1);
  assert.deepEqual(page.errors, []);
});

test('an open note retries initialization when its toolbar arrives later', async () => {
  const page = fixture();
  const { note } = page.addNote({ toolbar: false });
  page.start();
  await page.settings();
  assert.equal(note.gkfs, undefined);
  page.addToolbar(note);
  page.mutate(note);
  assert.equal(typeof note.gkfs.toggle_fullscreen, 'function');
  assert.equal(note.querySelectorAll('.gkfs-toggle').length, 1);
  assert.equal(page.body.classList.contains('gkfs-fullscreen'), true);
  assert.deepEqual(page.errors, []);
});

test('an incomplete legacy toolbar retries when its more button arrives', async () => {
  const page = fixture();
  const { note } = page.addNote({ toolbarClass: 'IZ65Hb-yePe5c', withMore: false });
  page.start();
  await page.settings();
  assert.equal(note.gkfs, undefined);
  const toolbar = note.querySelector('.IZ65Hb-yePe5c');
  page.addMore(toolbar);
  page.mutate(toolbar);
  assert.equal(typeof note.gkfs.toggle_fullscreen, 'function');
  assert.equal(note.querySelectorAll('.gkfs-toggle').length, 1);
  assert.deepEqual(page.errors, []);
});

test('startup waits for saved fullscreen preference before processing an open note', async () => {
  const page = fixture();
  const { note } = page.addNote({ toolbarClass: 'IZ65Hb-yePe5c' });
  page.start();
  assert.equal(page.body.classList.contains('gkfs-fullscreen'), false);
  await page.settings({ settings: { fullscreen: false } });
  assert.equal(page.body.classList.contains('gkfs-fullscreen'), false);
  assert.equal(note.querySelector('.gkfs-toggle').classList.contains('active'), false);
  page.mutate(note);
  assert.equal(page.body.classList.contains('gkfs-fullscreen'), false);
  assert.deepEqual(page.errors, []);
});

test('injection after the load event initializes without another load event', async () => {
  const page = fixture({ readyState: 'complete' });
  await page.settings();
  const { note } = page.addNote();
  page.mutate(page.body);
  assert.equal(page.body.classList.contains('gkfs-fullscreen'), true);
  assert.equal(typeof note.gkfs.toggle_fullscreen, 'function');
  assert.deepEqual(page.errors, []);
});

test('a cold direct-link modal maximizes without the reopen-only Keep class', async () => {
  const page = fixture();
  const { note, container } = page.addNote({ modal: true });
  page.start();
  await page.settings();
  assert.equal(container.classList.contains('IZ65Hb-QQhtn'), false);
  assert.equal(container.classList.contains('gkfs-open-note'), true);
  assert.equal(page.body.classList.contains('gkfs-has-open-note'), true);
  assert.equal(page.body.classList.contains('gkfs-fullscreen'), true);
  page.mutate(note);
  page.mutate(note);
  assert.equal(note.querySelectorAll('.gkfs-toggle').length, 1);
  assert.deepEqual(page.errors, []);
});

test('a preexisting dialog opens and closes through class mutations', async () => {
  const page = fixture();
  const { note, dialog, container } = page.addNote({ modal: true, open: false });
  page.start();
  await page.settings();
  assert.equal(page.body.classList.contains('gkfs-has-open-note'), false);
  dialog.classList.add('eo9XGd');
  page.mutate(dialog, 'attributes');
  assert.equal(container.classList.contains('gkfs-open-note'), true);
  assert.equal(page.body.classList.contains('gkfs-has-open-note'), true);
  assert.equal(page.body.classList.contains('gkfs-fullscreen'), true);
  dialog.classList.remove('eo9XGd');
  page.mutate(dialog, 'attributes');
  assert.equal(container.classList.contains('gkfs-open-note'), false);
  assert.equal(page.body.classList.contains('gkfs-has-open-note'), false);
  dialog.classList.add('eo9XGd');
  page.mutate(dialog, 'attributes');
  assert.equal(container.classList.contains('gkfs-open-note'), true);
  assert.equal(note.querySelectorAll('.gkfs-toggle').length, 1);
  assert.deepEqual(page.errors, []);
});
