const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')

const isDev = Boolean(process.env.AUDIO2TXT_ELECTRON_DEV)
const appRoot = path.resolve(__dirname, '..')
const resourceRoot = app.isPackaged ? process.resourcesPath : appRoot
const serverPort = Number(process.env.PORT || 3001)
let mainWindow = null

process.env.AUDIO2TXT_PORTABLE_ROOT = resourceRoot
process.env.PORT = String(serverPort)

require('../server/portable-server.cjs')

app.setAppUserModelId('com.shim1999.audio2txt')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    title: 'Audio2txt',
    backgroundColor: '#f4faf8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.removeMenu()

  const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
  const appUrl = isDev ? devUrl : `http://127.0.0.1:${serverPort}`

  setTimeout(() => {
    mainWindow.loadURL(appUrl)
  }, 700)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function configureUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('updater:error', error.message)
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('updater:not-available', info)
  })
}

ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) {
    return { updateAvailable: false, message: 'Updater is available in packaged builds.' }
  }

  const result = await autoUpdater.checkForUpdates()
  return {
    updateAvailable: Boolean(result?.updateInfo),
    version: result?.updateInfo?.version || '',
  }
})

ipcMain.handle('updater:download', async () => {
  if (!app.isPackaged) {
    return { ok: false, message: 'Updater is available in packaged builds.' }
  }

  await autoUpdater.downloadUpdate()
  return { ok: true }
})

ipcMain.handle('updater:restart', () => {
  autoUpdater.quitAndInstall(false, true)
})

app.whenReady().then(() => {
  configureUpdater()
  createWindow()
})

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

process.on('uncaughtException', (error) => {
  dialog.showErrorBox('Audio2txt crashed', error.stack || error.message)
})
