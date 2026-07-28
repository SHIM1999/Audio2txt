const path = require('node:path')
const { pathToFileURL } = require('node:url')

const appDir = path.dirname(process.execPath)
const serverPath = path.join(appDir, 'server', 'index.js')

process.chdir(appDir)
process.env.AUDIO2TXT_PORTABLE_ROOT = appDir

import(pathToFileURL(serverPath).href).catch((error) => {
  console.error(error)
  process.exit(1)
})
