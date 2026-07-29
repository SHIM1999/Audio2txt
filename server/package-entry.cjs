const path = require('node:path')

const appDir = path.dirname(process.execPath)

process.chdir(appDir)
process.env.AUDIO2TXT_PORTABLE_ROOT = appDir

require('./portable-server.cjs')
