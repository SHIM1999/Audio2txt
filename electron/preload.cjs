const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('audio2txtDesktop', {
  version: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  restartToUpdate: () => ipcRenderer.invoke('updater:restart'),
  onUpdateAvailable: (callback) => ipcRenderer.on('updater:available', (_event, payload) => callback(payload)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('updater:not-available', (_event, payload) => callback(payload)),
  onUpdateError: (callback) => ipcRenderer.on('updater:error', (_event, payload) => callback(payload)),
})
