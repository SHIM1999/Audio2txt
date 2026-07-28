const { spawn } = require('node:child_process')
const path = require('node:path')

const appDir = path.dirname(process.execPath)
const serverPath = path.join(appDir, 'server', 'index.js')
const child = spawn(process.execPath, [serverPath], {
  cwd: appDir,
  env: {
    ...process.env,
    AUDIO2TXT_PORTABLE_ROOT: appDir,
  },
  stdio: 'inherit',
  windowsHide: false,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
