const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('audio2txtDesktop', {
  version: () => ipcRenderer.invoke('app:version'),
  getExportFolder: () => ipcRenderer.invoke('settings:get-export-folder'),
  chooseExportFolder: () => ipcRenderer.invoke('settings:choose-export-folder'),
  clearExportFolder: () => ipcRenderer.invoke('settings:clear-export-folder'),
  saveExportFile: (payload) => ipcRenderer.invoke('export:save-file', payload),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  restartToUpdate: () => ipcRenderer.invoke('updater:restart'),
  onUpdateAvailable: (callback) => ipcRenderer.on('updater:available', (_event, payload) => callback(payload)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('updater:not-available', (_event, payload) => callback(payload)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('updater:downloaded', (_event, payload) => callback(payload)),
  onUpdateError: (callback) => ipcRenderer.on('updater:error', (_event, payload) => callback(payload)),
})
