if (require('electron-squirrel-startup')) {
  process.exit(0)
}

const { app, autoUpdater, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const isDev = Boolean(process.env.AUDIO2TXT_ELECTRON_DEV)
const appRoot = path.resolve(__dirname, '..')
const resourceRoot = app.isPackaged ? process.resourcesPath : appRoot
const iconPath = path.join(resourceRoot, 'build', 'icon.ico')
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
    icon: iconPath,
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
  if (!app.isPackaged) return

  const feedUrl = `https://update.electronjs.org/SHIM1999/Audio2txt/win32-x64/${app.getVersion()}`
  autoUpdater.setFeedURL({ url: feedUrl })

  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('updater:error', error.message)
  })

  autoUpdater.on('update-available', () => {
    const info = { version: 'newer' }
    mainWindow?.webContents.send('updater:available', info)
  })

  autoUpdater.on('update-not-available', () => {
    const info = { version: app.getVersion() }
    mainWindow?.webContents.send('updater:not-available', info)
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('updater:downloaded', { ready: true })
  })
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeSettings(settings) {
  const settingsPath = getSettingsPath()
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function getUpdatePackageCachePath() {
  if (app.isPackaged) {
    return path.resolve(path.dirname(process.execPath), '..', 'packages')
  }

  return path.join(app.getPath('localappdata'), 'audio2txt', 'packages')
}

function clearUpdatePackageCache() {
  const packagesPath = getUpdatePackageCachePath()
  fs.rmSync(packagesPath, { recursive: true, force: true })
  fs.mkdirSync(packagesPath, { recursive: true })
  return packagesPath
}

ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('settings:get-export-folder', () => {
  return readSettings().exportFolder || ''
})

ipcMain.handle('settings:choose-export-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Audio2txt export folder',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true, exportFolder: readSettings().exportFolder || '' }
  }

  const exportFolder = result.filePaths[0]
  writeSettings({ ...readSettings(), exportFolder })
  return { canceled: false, exportFolder }
})

ipcMain.handle('settings:clear-export-folder', () => {
  writeSettings({ ...readSettings(), exportFolder: '' })
  return { exportFolder: '' }
})

ipcMain.handle('export:save-file', async (_event, payload) => {
  const exportFolder = readSettings().exportFolder
  if (!exportFolder) {
    return { ok: false, message: 'No export folder is selected.' }
  }

  fs.mkdirSync(exportFolder, { recursive: true })

  const safeFilename = path.basename(String(payload?.filename || 'audio2txt-export.txt'))
  const outputPath = path.join(exportFolder, safeFilename)
  const content = payload?.content

  if (typeof content === 'string') {
    fs.writeFileSync(outputPath, content, 'utf8')
  } else {
    fs.writeFileSync(outputPath, Buffer.from(new Uint8Array(content)))
  }

  return { ok: true, path: outputPath }
})

ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) {
    return { updateAvailable: false, message: 'Updater is available in packaged builds.' }
  }

  clearUpdatePackageCache()
  autoUpdater.checkForUpdates()
  return { updateAvailable: false, message: 'Checking for installer updates after refreshing the update cache...' }
})

ipcMain.handle('updater:download', async () => {
  if (!app.isPackaged) {
    return { ok: false, message: 'Updater is available in packaged builds.' }
  }

  clearUpdatePackageCache()
  return { ok: true, message: 'Squirrel downloads updates automatically after a successful check.' }
})

ipcMain.handle('updater:repair-cache', async () => {
  const deletedPath = clearUpdatePackageCache()
  return {
    ok: true,
    path: deletedPath,
    message: 'Updater cache repaired. Try Check again.',
  }
})

ipcMain.handle('updater:restart', () => {
  autoUpdater.quitAndInstall()
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
