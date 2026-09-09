// Run with: node_modules/.bin/electron test/note-fullscreen.electron.cjs
// Uses a hidden Chromium window and disposable profile; no Google account needed.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-fullscreen-render-'));
app.setPath('userData', profile);
const extension = path.join(__dirname, '..', 'chrome-google-keep-full-screen', 'src');
const source = fs.readFileSync(path.join(extension, 'content', 'script.js'), 'utf8');
const css = fs.readFileSync(path.join(extension, 'content', 'styles.css'), 'utf8');
let window;
const deadline = setTimeout(() => { console.error('Rendering test timed out'); app.exit(1); }, 15000);

app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, width: 800, height: 600,
    webPreferences: { contextIsolation: true, nodeIntegration: false } });
  const html = `<!doctype html><html><head><style>
    html,body { margin:0; height:100%; background:white; }
    .VIpgJd-TUo6Hb { position:fixed; inset:30px 0 0; }
    .IZ65Hb-TBnied { position:relative; width:320px; height:250px; }
    .IZ65Hb-iib5kc { display:none; }
    .IZ65Hb-QQhtn .IZ65Hb-iib5kc { display:block; }
  </style></head><body>
    <div class="VIpgJd-TUo6Hb XKSfm-L9AdLc eo9XGd">
      <div class="IZ65Hb-n0tgWb IZ65Hb-bJ69tf oT9UPb">
        <div class="IZ65Hb-TBnied"><div class="IZ65Hb-nK2kYb">
          <div class="IZ65Hb-iib5kc" role="button" tabindex="0">Close</div>
          <div role="toolbar">
            <div class="Q0hgme-LgbsSe Q0hgme-Bz112c-LgbsSe xl07Ob INgbqf-LgbsSe VIpgJd-LgbsSe"></div>
          </div>
        </div></div>
      </div>
    </div>
  </body></html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  // Model Keep's existing native action before loading the extension.
  await window.webContents.executeJavaScript(`
    window.nativeCloseCount = 0;
    document.querySelector('.IZ65Hb-iib5kc').addEventListener('click', () => {
      window.nativeCloseCount++;
      document.querySelector('.VIpgJd-TUo6Hb').classList.remove('eo9XGd');
    });
  `);
  await window.webContents.insertCSS(css);
  await window.webContents.executeJavaScript(`
    window.chrome = {
      storage: { sync: { get: (keys, callback) => callback({}),
        set: (data, callback) => callback && callback() } },
      runtime: { onMessage: { addListener() {} } }
    };
    ${source}`);
  const result = await window.webContents.executeJavaScript(`(async () => {
    const settle = () => new Promise(resolve => setTimeout(resolve, 50));
    await settle();
    const container = document.querySelector('.IZ65Hb-n0tgWb');
    const note = document.querySelector('.IZ65Hb-TBnied');
    const dialog = container.parentElement;
    const rect = note.getBoundingClientRect();
    const closeButton = note.querySelector('.IZ65Hb-iib5kc');
    const closeRect = closeButton.getBoundingClientRect();
    const initial = { marked: container.classList.contains('gkfs-open-note'),
      legacyClass: container.classList.contains('IZ65Hb-QQhtn'),
      width: rect.width, height: rect.height, viewportWidth: innerWidth,
      viewportHeight: innerHeight, buttons: note.querySelectorAll('.gkfs-toggle').length,
      closeVisible: getComputedStyle(closeButton).display !== 'none' &&
        closeRect.width > 0 && closeRect.height > 0,
      closeInViewport: closeRect.left >= 0 && closeRect.top >= 0 &&
        closeRect.right <= innerWidth && closeRect.bottom <= innerHeight };
    closeButton.click();
    await settle();
    const closed = { marked: container.classList.contains('gkfs-open-note'),
      open: document.body.classList.contains('gkfs-has-open-note') };
    dialog.classList.add('eo9XGd');
    await settle();
    return { initial, closed, reopened: container.classList.contains('gkfs-open-note'),
      buttons: note.querySelectorAll('.gkfs-toggle').length,
      nativeCloseCount: window.nativeCloseCount,
      nativeCloseButtons: note.querySelectorAll('.IZ65Hb-iib5kc').length };
  })()`);
  assert.equal(result.initial.legacyClass, false);
  assert.equal(result.initial.marked, true, 'cold modal must be recognized');
  assert.ok(Math.abs(result.initial.width - result.initial.viewportWidth) <= 1,
    `fullscreen width: ${JSON.stringify(result.initial)}`);
  assert.ok(Math.abs(result.initial.height - result.initial.viewportHeight) <= 1,
    `fullscreen height: ${JSON.stringify(result.initial)}`);
  assert.equal(result.initial.buttons, 1);
  assert.equal(result.initial.closeVisible, true, 'native Close must be visible on cold open');
  assert.equal(result.initial.closeInViewport, true, 'native Close must stay inside the viewport');
  assert.deepEqual(result.closed, { marked: false, open: false });
  assert.equal(result.nativeCloseCount, 1, 'click must invoke the existing native handler');
  assert.equal(result.nativeCloseButtons, 1, 'preserve the single native Close button');
  assert.equal(result.reopened, true);
  assert.equal(result.buttons, 1);
  console.log('PASS: cold modal fills viewport, exposes native Close, and handles close/reopen');
}).then(() => finish(0), (error) => { console.error(error); finish(1); });

function finish(code) {
  clearTimeout(deadline);
  if (window) window.destroy();
  // Chromium may still hold profile files until process exit. Cleanup is best effort.
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  app.exit(code);
}
