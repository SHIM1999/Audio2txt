const path = require('node:path')
const { createWindowsInstaller } = require('electron-winstaller')

const root = path.resolve(__dirname, '..')
const version = require(path.join(root, 'package.json')).version

async function main() {
  const appDirectory = path.join(root, 'desktop-release-packager', 'Audio2txt-win32-x64')
  const outputDirectory = path.join(root, 'desktop-release-installer')
  const iconPath = path.join(root, 'build', 'icon.ico')

  await createWindowsInstaller({
    appDirectory,
    outputDirectory,
    authors: 'SHIM1999',
    exe: 'Audio2txt.exe',
    setupExe: `Audio2txt-Setup-${version}.exe`,
    setupMsi: `Audio2txt-Setup-${version}.msi`,
    setupIcon: iconPath,
    noMsi: false,
    title: 'Audio2txt',
  })

  console.log(`Created installer artifacts in ${outputDirectory}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
