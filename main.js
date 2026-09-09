const electron = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const Store = require('electron-store').default;
const { Console } = require('node:console');

// The launcher's output pipes may close while the app stays in the tray.
// Keep diagnostic writes from interrupting window and timer operations.
const console = new Console({
  stdout: process.stdout,
  stderr: process.stderr,
  ignoreErrors: true,
});

console.log('Electron version:', process.versions.electron); // Diagnostic log

const store = new Store();

let mainWindow;
let tray;
let alwaysOnTop = store.get('alwaysOnTop', false); // Persisted always-on-top state
let showTitleBar = store.get('showTitleBar', true); // Persisted show-title-bar state, enabled by default
let stayHidden = false; // Flag to prevent auto re-show
let reShowTimeoutId = null; // Track the current re-show timer
let extensions;

const DEFAULT_WINDOW_WIDTH = 300;
const DEFAULT_WINDOW_HEIGHT = 500; // Swapped to DEFAULT_ prefix for clarity

function getSafeBounds(bounds) {
  const displays = electron.screen.getAllDisplays();
  const primaryDisplay = electron.screen.getPrimaryDisplay();
  const width = bounds && bounds.width ? bounds.width : DEFAULT_WINDOW_WIDTH;
  const height = bounds && bounds.height ? bounds.height : DEFAULT_WINDOW_HEIGHT;

  const defaultBounds = {
    width,
    height,
    x: primaryDisplay.workArea.x + primaryDisplay.workArea.width - width - 20,
    y: primaryDisplay.workArea.y + 40,
  };

  if (!bounds || typeof bounds.x !== 'number' || typeof bounds.y !== 'number') {
    return defaultBounds;
  }

  const isVisibleOnAnyDisplay = displays.some((display) => {
    const area = display.workArea;
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
    return overlapX >= 50 && overlapY >= 50;
  });

  if (!isVisibleOnAnyDisplay) {
    console.log('Saved bounds outside visible displays, resetting to safe bounds:', defaultBounds);
    return defaultBounds;
  }

  return {
    width,
    height,
    x: bounds.x,
    y: bounds.y,
  };
}

function resetWindowPosition() {
  if (!mainWindow) return;
  const primaryDisplay = electron.screen.getPrimaryDisplay();
  const currentBounds = mainWindow.getBounds();
  const width = currentBounds.width || DEFAULT_WINDOW_WIDTH;
  const height = currentBounds.height || DEFAULT_WINDOW_HEIGHT;
  const safeBounds = {
    width,
    height,
    x: primaryDisplay.workArea.x + primaryDisplay.workArea.width - width - 20,
    y: primaryDisplay.workArea.y + 40,
  };
  mainWindow.setBounds(safeBounds);
  store.set('windowBounds', safeBounds);
  mainWindow.showInactive();
  updateTrayMenu();
}


function createWindow() {
  // Load persisted window bounds
  const savedBounds = store.get('windowBounds', {});
  const bounds = getSafeBounds(savedBounds);
  mainWindow = new electron.BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 200,
    minHeight: 300,
    resizable: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: getIconPath(),
    autoHideMenuBar: true, // hide menu bar by default
    alwaysOnTop: alwaysOnTop, // initialize with persisted state
    skipTaskbar: true, // do not show in taskbar
    frame: showTitleBar, // control title bar visibility
  });

  // Save window bounds on move/resize
  mainWindow.on('move', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', bounds);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window-moved-or-resized');
    }
  });
  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', bounds);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window-moved-or-resized');
    }
  });

  // Get stored URL or use default
  const defaultUrl = 'https://keep.google.com/u/0/';
  const keepUrl = store.get('keepUrl', defaultUrl);
  console.log('Loading URL on window creation:', keepUrl);
  mainWindow.loadURL(keepUrl);

  mainWindow.webContents.on('did-finish-load', () => {});

  mainWindow.on('close', (e) => {
    // Hide window instead of closing (app stays in tray)
    if (!electron.app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
      startReShowTimer();
    }
    return false;
  });

  // Hide menu bar if not already hidden
  mainWindow.setMenuBarVisibility(false);
}

function getIconPath() {
  // Use a default icon if none exists
  const iconIco = path.join(__dirname, 'icon.ico');
  if (fs.existsSync(iconIco)) return iconIco;
  const iconPng = path.join(__dirname, 'icon.png');
  if (fs.existsSync(iconPng)) return iconPng;
  return undefined; // fallback to Electron default
}

function startReShowTimer() {
  if (reShowTimeoutId) clearTimeout(reShowTimeoutId);
  
  const timerMinutes = store.get('reShowTimer', 15);
  console.log(`Scheduling re-show in ${timerMinutes} minutes`);
  
  reShowTimeoutId = setTimeout(() => {
    if (stayHidden) {
      console.log('Stay Hidden is enabled, looping timer...');
      startReShowTimer();
    } else {
      console.log('Re-showing hidden memo...');
      if (mainWindow) {
        mainWindow.showInactive();
      }
      reShowTimeoutId = null;
    }
  }, timerMinutes * 60 * 1000);
}

function toggleWindow() {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    startReShowTimer();
  } else {
    const currentBounds = mainWindow.getBounds();
    const safeBounds = getSafeBounds(currentBounds);
    if (safeBounds.x !== currentBounds.x || safeBounds.y !== currentBounds.y) {
      mainWindow.setBounds(safeBounds);
      store.set('windowBounds', safeBounds);
    }
    mainWindow.showInactive();
    if (reShowTimeoutId) {
      clearTimeout(reShowTimeoutId);
      reShowTimeoutId = null;
    }
  }
  updateTrayMenu();
}

function createTray() {
  const icon = getIconPath();
  tray = new electron.Tray(icon || undefined);
  tray.setToolTip('Google Keep Memo Pad');

  tray.on('click', () => {
    toggleWindow();
  });

  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const isVisible = mainWindow && mainWindow.isVisible();
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide Memo' : 'Show Memo',
      click: () => {
        toggleWindow();
      },
    },
    ...(!isVisible ? [{
      label: 'Stay Hidden',
      type: 'checkbox',
      checked: stayHidden,
      click: () => {
        stayHidden = !stayHidden;
        updateTrayMenu();
      },
    }] : []),
    {
      label: 'Reset Position',
      click: () => {
        resetWindowPosition();
      },
    },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: alwaysOnTop,
      click: () => {
        alwaysOnTop = !alwaysOnTop;
        store.set('alwaysOnTop', alwaysOnTop);
        if (mainWindow) mainWindow.setAlwaysOnTop(alwaysOnTop);
        updateTrayMenu();
      },
    },
    {
      label: 'Show Title Bar',
      type: 'checkbox',
      checked: showTitleBar,
      click: () => {
        showTitleBar = !showTitleBar;
        store.set('showTitleBar', showTitleBar);
        if (mainWindow) {
          // Recreate window to apply frame change
          const currentBounds = mainWindow.getBounds();
          mainWindow.close();
          mainWindow = null; // Clear reference to old window
          createWindow();
          mainWindow.setBounds(currentBounds);
            mainWindow.showInactive();
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Settings',
      click: async () => {
        try {
          // Get the current URL from the store
          const defaultUrl = 'https://keep.google.com/u/0/';
          const currentUrl = store.get('keepUrl', defaultUrl);
          console.log('Current URL from store:', currentUrl);
          
          // Create a custom input dialog using BrowserWindow with proper preload script
          const inputWindow = new electron.BrowserWindow({
            parent: mainWindow,
            modal: true,
            width: 500,
            height: 260,
            minimizable: false,
            maximizable: false,
            resizable: false,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              preload: path.join(__dirname, 'url-dialog-preload.js')
            },
            autoHideMenuBar: true,
            title: 'Settings',
          });
          
          // Create HTML content for the input dialog
          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>Settings</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                  margin: 0;
                  padding: 20px;
                  color: #333;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  height: 100vh;
                  box-sizing: border-box;
                }
                .container {
                  display: flex;
                  flex-direction: column;
                  gap: 16px;
                }
                .setting-group {
                  display: flex;
                  flex-direction: column;
                }
                label {
                  margin-bottom: 8px;
                  font-weight: 500;
                }
                input {
                  padding: 8px;
                  border: 1px solid #ccc;
                  border-radius: 4px;
                  font-size: 14px;
                  width: 100%;
                  box-sizing: border-box;
                }
                .button-row {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 10px;
                }
                .button-row button {
                  flex: 0 0 auto;
                }
                .current-page {
                  margin-right: auto;
                  background-color: #f5f5f5;
                  border: 1px solid #ddd;
                }
                .current-page:hover {
                  background-color: #e8e8e8;
                }
                .cancel {
                  background-color: #e0e0e0;
                }
                .save {
                  background-color: #2196F3;
                  color: white;
                }
                button {
                  padding: 8px 16px;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 14px;
                  white-space: nowrap;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="setting-group">
                  <label for="urlInput">Default URL (leave blank to reset):</label>
                  <input type="url" id="urlInput" value="${currentUrl}" placeholder="https://keep.google.com/u/0/#LIST/..." />
                </div>
                <div class="setting-group">
                  <label for="timerInput">Automatically un-hide memo after (minutes):</label>
                  <input type="number" id="timerInput" value="${store.get('reShowTimer', 15)}" min="1" />
                </div>
                <div class="button-row">
                  <button class="current-page" onclick="useCurrentPage()">Use Current Page</button>
                  <button class="cancel" onclick="window.electronAPI.cancel()">Cancel</button>
                  <button class="save" onclick="window.electronAPI.saveSettings({
                    url: document.getElementById('urlInput').value,
                    timer: document.getElementById('timerInput').value
                  })">Save</button>
                </div>
              </div>
              <script>
                async function useCurrentPage() {
                  try {
                    const currentUrl = await window.electronAPI.getCurrentPageUrl();
                    if (currentUrl) {
                      document.getElementById('urlInput').value = currentUrl;
                    }
                  } catch (error) {
                    console.error('Error getting current page URL:', error);
                  }
                }
              </script>
            </body>
            </html>
          `;
          
          // Create a variable to store the result
          let result = null;
          let userCancelled = false;
          
          // Set up IPC handlers
          const { ipcMain } = electron;
          
          // Handler for settings selection
          ipcMain.once('settings-saved', (event, settings) => {
            console.log('Settings received via IPC:', settings);
            result = settings;
            inputWindow.close();
          });
          
          // Handler for cancellation
          ipcMain.once('url-dialog-cancelled', () => {
            console.log('Dialog cancelled via IPC');
            userCancelled = true;
            inputWindow.close();
          });
          
          // Handler for getting current page URL
          ipcMain.once('get-current-page-url', (event) => {
            try {
              const currentPageUrl = mainWindow.webContents.getURL();
              console.log('Current page URL requested:', currentPageUrl);
              event.sender.send('current-page-url-response', currentPageUrl);
            } catch (error) {
              console.error('Error getting current page URL:', error);
              event.sender.send('current-page-url-response', '');
            }
          });
          
          // Load the HTML content
          inputWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
          
          // Wait for the window to close
          await new Promise(resolve => {
            inputWindow.on('closed', resolve);
          });
          
          // Clean up IPC handlers
          ipcMain.removeAllListeners('url-selected');
          ipcMain.removeAllListeners('url-dialog-cancelled');
          ipcMain.removeAllListeners('get-current-page-url');
          
          // If user cancelled or closed the window without selecting settings
          if (userCancelled || result === null) {
            console.log('User cancelled or closed the dialog without selecting settings');
            return; // Exit without making changes
          }
          
          const { url, timer } = result;
          
          // 1. Process Timer
          if (timer && !isNaN(parseInt(timer))) {
            const newTimer = parseInt(timer);
            console.log('Saving re-show timer to store:', newTimer);
            store.set('reShowTimer', newTimer);
            
            // If window is hidden, restart timer to apply new setting
            if (mainWindow && !mainWindow.isVisible()) {
              startReShowTimer();
            }
          }

          // 2. Process URL
          if (url.trim() === '') {
            console.log('Resetting URL to default');
            store.delete('keepUrl');
            
            // Verify the URL was deleted correctly
            const checkUrl = store.get('keepUrl', 'DEFAULT_NOT_SET');
            console.log('URL after reset (should be DEFAULT_NOT_SET):', checkUrl);
            
            // Reload the window with the default URL immediately
            console.log('Reloading window with default URL:', defaultUrl);
            mainWindow.loadURL(defaultUrl);
          } else {
            // Basic URL validation
            try {
              new URL(url); // Check if it's a valid URL format
              
              // Save the URL to the store
              console.log('Saving URL to store:', url);
              store.set('keepUrl', url);
              
              // Verify the URL was saved correctly
              const savedUrl = store.get('keepUrl');
              console.log('URL retrieved from store after saving:', savedUrl);
              
              // Reload the window with the new URL immediately
              console.log('Reloading window with URL:', url);
              mainWindow.loadURL(url);
            } catch (e) {
              console.error('Invalid URL:', e);
              electron.dialog.showErrorBox('Invalid URL', 'The URL you entered is not valid. Please try again.');
            }
          }
        } catch (error) {
          console.error('Error in Set Default Note URL click handler:', error);
          electron.dialog.showErrorBox('Error', 'Could not set default URL. Please check the console for details.');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        electron.app.isQuiting = true;
        electron.app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

electron.app.on('ready', async () => {
  // Initialize ElectronChromeExtensions with required license
  extensions = new ElectronChromeExtensions({ license: "GPL-3.0" });

  // Load the unpacked Chrome extension
  const extPath = path.join(__dirname, 'chrome-google-keep-full-screen');
  try {
    const loadedExt = await (mainWindow ? mainWindow.webContents.session : electron.session.defaultSession).loadExtension(extPath, { allowFileAccess: true });
    console.log('Loaded extension:', loadedExt);
  } catch (err) {
    console.error('Failed to load extension:', err);
  }

  createWindow();
  createTray();
  
  // Open DevTools for debugging
  if (mainWindow) {
    // mainWindow.webContents.openDevTools();
  }
  
  if (mainWindow) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.showInactive(); // Show window at startup
    });
  }
});

electron.app.on('window-all-closed', (e) => {
  // Don't quit app when all windows are closed (keep in tray)
  e.preventDefault();
});

electron.app.on('activate', () => {
  if (mainWindow) mainWindow.showInactive();
});

const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
}

electron.app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: 'deny' };
  });
});

// --- IPC handlers for drag region tracking ---
const { ipcMain, screen } = electron;

ipcMain.handle('get-cursor-position', () => {
  // Returns { x, y } in screen coordinates
  return screen.getCursorScreenPoint();
});

ipcMain.handle('get-window-bounds', () => {
  if (!mainWindow) return null;
  // Returns { x, y, width, height }
  return mainWindow.getBounds();
});
