const cors = require('cors')
const express = require('express')
const multer = require('multer')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const rootDir = process.env.AUDIO2TXT_PORTABLE_ROOT || path.resolve(__dirname, '..')
const uploadDir = path.join(rootDir, 'uploads')
const distDir = path.join(rootDir, 'dist')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const releaseRepo = 'SHIM1999/Audio2txt'
const releasesUrl = `https://github.com/${releaseRepo}/releases/latest`

fs.mkdirSync(uploadDir, { recursive: true })

const app = express()
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 1024 * 1024 * 500,
  },
})

app.use(cors())
app.use(express.json())

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/update/check', async (_req, res) => {
  try {
    const latestRelease = await fetchLatestGitHubRelease()
    const updateAvailable = compareVersions(latestRelease.version, packageJson.version) > 0

    res.json({
      currentVersion: packageJson.version,
      latestVersion: latestRelease.version,
      releaseUrl: latestRelease.url,
      assetName: latestRelease.assetName,
      updateAvailable,
      canInstall: false,
      mode: 'portable',
      message: updateAvailable
        ? `Version ${latestRelease.version} is available. Download the newest portable ZIP.`
        : 'You are on the latest portable release.',
    })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not check for updates.',
    })
  }
})

app.post('/api/update/install', (_req, res) => {
  res.status(400).json({
    releaseUrl: releasesUrl,
    error: 'Portable builds update by downloading the newest Release ZIP.',
  })
})

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Upload an M4A, MP3, WAV, or MP4 audio file.' })
    return
  }

  const jobId = randomUUID()
  const inputPath = req.file.path
  const model = sanitizeChoice(req.body.model, ['tiny', 'base', 'small', 'medium'], 'base')
  const language = sanitizeChoice(req.body.language, ['ko', 'auto'], 'ko')
  const device = sanitizeChoice(req.body.device, ['auto', 'cpu', 'cuda'], 'auto')

  try {
    let result
    try {
      result = await runTranscriber({ inputPath, model, language, device, jobId })
    } catch (error) {
      if (!shouldRetryOnCpu(error, device)) throw error

      result = await runTranscriber({ inputPath, model, language, device: 'cpu', jobId })
      result.warning = 'Auto/GPU engine crashed, so Audio2txt retried safely with CPU. For this PC, keep Engine on CPU or cut a shorter range first.'
    }

    res.json(result)
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Transcription failed.',
    })
  } finally {
    fs.rm(inputPath, { force: true }, () => {})
  }
})

function sanitizeChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback
}

function runTranscriber({ inputPath, model, language, device, jobId }) {
  return new Promise((resolve, reject) => {
    const transcriber = getTranscriberCommand()
    const args = [
      '--audio',
      inputPath,
      '--model',
      model,
      '--language',
      language,
      '--device',
      device,
      '--job-id',
      jobId,
    ]

    const child = spawn(transcriber.command, [...transcriber.args, ...args], {
      cwd: rootDir,
      env: transcriberEnv(),
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(new Error(`Could not start transcriber: ${error.message}`))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(buildTranscriberError(code, stderr))
        error.transcriberExitCode = code
        reject(error)
        return
      }

      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error(`Could not read transcriber output. ${stderr}`.trim()))
      }
    })
  })
}

function shouldRetryOnCpu(error, device) {
  return device !== 'cpu' && Number(error?.transcriberExitCode) === 3221225477
}

function buildTranscriberError(code, stderr) {
  const cleaned = cleanTranscriberError(stderr)
  if (cleaned) return cleaned

  if (Number(code) === 3221225477) {
    return 'The native transcription engine crashed on this PC. Try Engine: CPU, or cut a shorter range before transcribing.'
  }

  return `Transcriber exited with code ${code}.`
}

function transcriberEnv() {
  return {
    ...process.env,
    HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
    HF_HUB_DISABLE_TELEMETRY: '1',
  }
}

function cleanTranscriberError(stderr) {
  const ignored = [
    /unauthenticated requests to the HF Hub/i,
    /huggingface_hub[\\/]+file_download\.py/i,
    /cache-system uses symlinks/i,
    /HF_HUB_DISABLE_SYMLINKS_WARNING/i,
    /Xet Storage is enabled/i,
    /hf_xet package is not installed/i,
    /pip install (?:huggingface_hub\[hf_xet\]|hf_xet)/i,
    /enable-your-device-for-development/i,
  ]

  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !ignored.some((pattern) => pattern.test(line)))
    .join('\n')
    .trim()
}

function getTranscriberCommand() {
  const runtimeExePath = path.join(rootDir, 'scripts', 'transcribe-runtime', 'transcribe.exe')
  if (fs.existsSync(runtimeExePath)) {
    return { command: runtimeExePath, args: [] }
  }

  const exePath = path.join(rootDir, 'scripts', 'transcribe.exe')
  if (fs.existsSync(exePath)) {
    return { command: exePath, args: [] }
  }

  return {
    command: process.platform === 'win32' ? 'py' : 'python3',
    args: process.platform === 'win32' ? ['-3.12', path.join(rootDir, 'scripts', 'transcribe.py')] : [path.join(rootDir, 'scripts', 'transcribe.py')],
  }
}

async function fetchLatestGitHubRelease() {
  const response = await fetch(`https://api.github.com/repos/${releaseRepo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'audio2txt-updater',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub release check failed: ${response.status}`)
  }

  const payload = await response.json()
  const version = String(payload.tag_name || '').replace(/^v/i, '')
  const asset = payload.assets?.find((item) => item.name?.includes('windows-portable')) || payload.assets?.[0]
  return {
    version,
    url: payload.html_url || releasesUrl,
    assetName: asset?.name || '',
  }
}

function compareVersions(a, b) {
  const left = String(a).split('.').map((part) => Number(part) || 0)
  const right = String(b).split('.').map((part) => Number(part) || 0)
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return 1
    if ((left[index] || 0) < (right[index] || 0)) return -1
  }

  return 0
}

if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`Audio2txt running at http://localhost:${port}`)
})
