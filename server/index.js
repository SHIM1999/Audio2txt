import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const uploadDir = path.join(rootDir, 'uploads')
const distDir = path.join(rootDir, 'dist')
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

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
    const currentCommit = await runCommand('git', ['rev-parse', '--short', 'HEAD'])
    const localBranch = await runCommand('git', ['branch', '--show-current'])
    const remoteUrl = await runCommand('git', ['config', '--get', 'remote.origin.url'])
    const repoPath = parseGitHubRepo(remoteUrl)

    if (!repoPath) {
      res.json({
        currentVersion: packageJson.version,
        currentCommit,
        localBranch,
        updateAvailable: false,
        canInstall: false,
        message: 'No GitHub remote is configured yet.',
      })
      return
    }

    const latest = await fetchLatestGitHubCommit(repoPath, localBranch || 'main')

    res.json({
      currentVersion: packageJson.version,
      currentCommit,
      localBranch,
      remoteUrl,
      remoteCommit: latest.sha.slice(0, 7),
      remoteDate: latest.date,
      updateAvailable: latest.sha.slice(0, 7) !== currentCommit,
      canInstall: true,
      message: latest.sha.slice(0, 7) === currentCommit ? 'You are up to date.' : 'A newer version is available.',
    })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not check for updates.',
    })
  }
})

app.post('/api/update/install', async (_req, res) => {
  try {
    await runCommand('git', ['pull', '--ff-only'])
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'])
    await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'])

    const currentCommit = await runCommand('git', ['rev-parse', '--short', 'HEAD'])
    res.json({
      ok: true,
      currentCommit,
      message: 'Update installed. Restart the app to run the newest server code.',
    })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not install update.',
    })
  }
})

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Upload an M4A, MP3, WAV, or MP4 audio file.' })
    return
  }

  const jobId = randomUUID()
  const inputPath = req.file.path
  const model = sanitizeChoice(req.body.model, ['tiny', 'base', 'small', 'medium'], 'small')
  const language = sanitizeChoice(req.body.language, ['ko', 'auto'], 'ko')
  const device = sanitizeChoice(req.body.device, ['auto', 'cpu', 'cuda'], 'auto')

  try {
    const result = await runTranscriber({ inputPath, model, language, device, jobId })
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
    const python = getPythonCommand()
    const args = [
      path.join(rootDir, 'scripts', 'transcribe.py'),
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

    const child = spawn(python.command, [...python.args, ...args], {
      cwd: rootDir,
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
      reject(new Error(`Could not start Python: ${error.message}`))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Transcriber exited with code ${code}.`))
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

function getPythonCommand() {
  if (process.env.PYTHON_BIN) {
    return { command: process.env.PYTHON_BIN, args: [] }
  }

  if (process.platform === 'win32') {
    return { command: 'py', args: ['-3.12'] }
  }

  return { command: 'python3', args: [] }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      windowsHide: true,
      shell: false,
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
      reject(new Error(`Could not start ${command}: ${error.message}`))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}.`))
        return
      }

      resolve(stdout.trim())
    })
  })
}

function parseGitHubRepo(remoteUrl) {
  const httpsMatch = remoteUrl.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/)
  return httpsMatch?.[1] || ''
}

async function fetchLatestGitHubCommit(repoPath, branch) {
  const response = await fetch(`https://api.github.com/repos/${repoPath}/commits/${branch}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'audio2txt-updater',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub update check failed: ${response.status}`)
  }

  const payload = await response.json()
  return {
    sha: payload.sha,
    date: payload.commit?.committer?.date || '',
  }
}

if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`Transcription API running at http://localhost:${port}`)
})
