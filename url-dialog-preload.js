const { contextBridge, ipcRenderer } = require('electron');

// Expose a limited API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Method to send settings back to the main process
  saveSettings: (settings) => ipcRenderer.send('settings-saved', settings),
  // Method to cancel the dialog
  cancel: () => ipcRenderer.send('url-dialog-cancelled'),
  // Method to request the current page URL
  getCurrentPageUrl: () => {
    return new Promise((resolve) => {
      ipcRenderer.once('current-page-url-response', (event, url) => {
        resolve(url);
      });
      ipcRenderer.send('get-current-page-url');
    });
  }
});
