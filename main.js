const electron = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const Store = require('electron-store').default;

console.log('Electron version:', process.versions.electron); // Diagnostic log

const store = new Store();

let mainWindow;
let tray;
let alwaysOnTop = store.get('alwaysOnTop', false); // Persisted always-on-top state
let showTitleBar = store.get('showTitleBar', true); // Persisted show-title-bar state, enabled by default
let extensions;

const DEFAULT_WINDOW_WIDTH = 300;
const DEFAULT_WINDOW_HEIGHT = 500; // Swapped to DEFAULT_ prefix for clarity

function createWindow() {
  // Load persisted window bounds
  const savedBounds = store.get('windowBounds', {});
  mainWindow = new electron.BrowserWindow({
    width: savedBounds.width || DEFAULT_WINDOW_WIDTH,
    height: savedBounds.height || DEFAULT_WINDOW_HEIGHT,
    x: typeof savedBounds.x === 'number' ? savedBounds.x : undefined,
    y: typeof savedBounds.y === 'number' ? savedBounds.y : undefined,
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

function toggleWindow() {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
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
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: mainWindow && mainWindow.isVisible() ? 'Hide Memo' : 'Show Memo',
      click: () => {
        toggleWindow();
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
          mainWindow.show();
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Set Default Note URL',
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
            height: 200,
            minimizable: false,
            maximizable: false,
            resizable: false,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              preload: path.join(__dirname, 'url-dialog-preload.js')
            },
            autoHideMenuBar: true,
            title: 'Set Default Note URL',
          });
          
          // Create HTML content for the input dialog
          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>Set Default Note URL</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                  margin: 20px 32px 20px 20px; /* More right margin */
                  color: #333;
                  display: flex;
                  flex-direction: column;
                  height: calc(100vh - 40px);
                }
                .container {
                  display: flex;
                  flex-direction: column;
                  flex: 1;
                }
                label {
                  margin-bottom: 8px;
                  font-weight: 500;
                }
                input {
                  padding: 8px;
                  margin-bottom: 8px; /* Reduced gap below input */
                  border: 1px solid #ccc;
                  border-radius: 4px;
                  font-size: 14px;
                  width: 100%;
                }
                .button-row {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-top: 16px;
                  gap: 10px;
                }
                .button-row button {
                  flex: 0 0 auto;
                }
                .current-page {
                  margin-right: auto;
                }
                button {
                  padding: 8px 16px;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 14px;
                  white-space: nowrap;
                }
                .current-page {
                  background-color: #f5f5f5;
                  border: 1px solid #ddd;
                  margin: 0;
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
              </style>
            </head>
            <body>
              <div class="container">
                <label for="urlInput">URL (leave blank to reset to default):</label>
                <input type="url" id="urlInput" value="${currentUrl}" placeholder="https://keep.google.com/u/0/#LIST/..." />
                <div class="button-row">
                  <button class="current-page" onclick="useCurrentPage()">Use Current Page</button>
                  <button class="cancel" onclick="window.electronAPI.cancel()">Cancel</button>
                  <button class="save" onclick="window.electronAPI.setUrl(document.getElementById('urlInput').value)">Save</button>
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
          
          // Handler for URL selection
          ipcMain.once('url-selected', (event, url) => {
            console.log('URL received via IPC:', url);
            result = url;
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
          
          // If user cancelled or closed the window without selecting a URL
          if (userCancelled || result === null) {
            console.log('User cancelled or closed the dialog without selecting a URL');
            return; // Exit without making changes
          }
          
          // Process the result
          if (result.trim() === '') {
            console.log('Resetting URL to default');
            store.delete('keepUrl');
            
            // Verify the URL was deleted correctly
            const checkUrl = store.get('keepUrl', 'DEFAULT_NOT_SET');
            console.log('URL after reset (should be DEFAULT_NOT_SET):', checkUrl);
            
            // Reload the window with the default URL immediately
            console.log('Reloading window with default URL:', defaultUrl);
            mainWindow.loadURL(defaultUrl);
            
            electron.dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'URL Reset',
              message: 'Default URL has been reset and applied.',
            });
          } else {
            // Basic URL validation
            try {
              new URL(result); // Check if it's a valid URL format
              
              // Save the URL to the store
              console.log('Saving URL to store:', result);
              store.set('keepUrl', result);
              
              // Verify the URL was saved correctly
              const savedUrl = store.get('keepUrl');
              console.log('URL retrieved from store after saving:', savedUrl);
              
              // Reload the window with the new URL immediately
              console.log('Reloading window with URL:', result);
              mainWindow.loadURL(result);
              
              electron.dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'URL Saved',
                message: 'New default URL saved and applied.',
              });
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
      mainWindow.show(); // Show window at startup
    });
  }
});

electron.app.on('window-all-closed', (e) => {
  // Don't quit app when all windows are closed (keep in tray)
  e.preventDefault();
});

electron.app.on('activate', () => {
  if (mainWindow) mainWindow.show();
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
