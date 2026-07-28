import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  Clipboard,
  Download,
  FileAudio,
  FileText,
  Languages,
  LoaderCircle,
  RefreshCw,
  Upload,
} from 'lucide-react'
import './App.css'

type Segment = {
  id: number
  start: string
  end: string
  text: string
}

type TranscriptResult = {
  model: string
  device: string
  computeType: string
  language: string
  languageProbability: number
  duration: number
  segments: Segment[]
  timestampedText: string
  plainText: string
}

type UpdateStatus = {
  currentVersion: string
  currentCommit: string
  localBranch?: string
  remoteCommit?: string
  remoteDate?: string
  updateAvailable: boolean
  canInstall: boolean
  message: string
}

const apiUrl = 'http://localhost:3001/api/transcribe'
const updateCheckUrl = 'http://localhost:3001/api/update/check'
const updateInstallUrl = 'http://localhost:3001/api/update/install'
const appName = 'Audio2txt'

function buildTimestampedText(segments: Segment[]) {
  return segments.map((segment) => `[${segment.start} - ${segment.end}] ${segment.text}`).join('\n')
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [model, setModel] = useState('small')
  const [language, setLanguage] = useState('ko')
  const [device, setDevice] = useState('auto')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false)
  const [error, setError] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [result, setResult] = useState<TranscriptResult | null>(null)

  const duration = useMemo(() => {
    if (!result?.duration) return ''
    const minutes = Math.floor(result.duration / 60)
    const seconds = Math.round(result.duration % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [result])

  const transcriptText = useMemo(() => {
    if (!result) return ''
    return buildTimestampedText(result.segments)
  }, [result])

  const baseName = useMemo(() => file?.name.replace(/\.[^.]+$/, '') || 'transcript', [file])

  function pickFile(nextFile?: File) {
    if (!nextFile) return
    setFile(nextFile)
    setResult(null)
    setError('')
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    pickFile(event.target.files?.[0])
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    pickFile(event.dataTransfer.files?.[0])
  }

  async function transcribe() {
    if (!file) {
      setError('Choose an audio file first.')
      return
    }

    setIsLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()
    formData.append('audio', file)
    formData.append('model', model)
    formData.append('language', language)
    formData.append('device', device)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Transcription failed.')
      }

      setResult({
        ...payload,
        timestampedText: buildTimestampedText(payload.segments),
        plainText: payload.segments.map((segment: Segment) => segment.text).join('\n'),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transcription failed.')
    } finally {
      setIsLoading(false)
    }
  }

  function updateSegmentText(id: number, text: string) {
    setResult((current) => {
      if (!current) return current

      const segments = current.segments.map((segment) => (
        segment.id === id ? { ...segment, text } : segment
      ))

      return {
        ...current,
        segments,
        timestampedText: buildTimestampedText(segments),
        plainText: segments.map((segment) => segment.text).join('\n'),
      }
    })
  }

  async function copyTranscript() {
    if (!result) return
    await navigator.clipboard.writeText(transcriptText)
  }

  async function checkForUpdates() {
    setIsCheckingUpdate(true)
    setUpdateStatus(null)

    try {
      const response = await fetch(updateCheckUrl)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Could not check for updates.')
      }

      setUpdateStatus(payload)
    } catch (caught) {
      setUpdateStatus({
        currentVersion: 'unknown',
        currentCommit: 'unknown',
        updateAvailable: false,
        canInstall: false,
        message: caught instanceof Error ? caught.message : 'Could not check for updates.',
      })
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  async function installUpdate() {
    setIsInstallingUpdate(true)

    try {
      const response = await fetch(updateInstallUrl, { method: 'POST' })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Could not install update.')
      }

      setUpdateStatus((current) => ({
        currentVersion: current?.currentVersion || 'updated',
        currentCommit: payload.currentCommit,
        updateAvailable: false,
        canInstall: false,
        message: payload.message,
      }))
    } catch (caught) {
      setUpdateStatus((current) => ({
        currentVersion: current?.currentVersion || 'unknown',
        currentCommit: current?.currentCommit || 'unknown',
        updateAvailable: current?.updateAvailable || false,
        canInstall: current?.canInstall || false,
        message: caught instanceof Error ? caught.message : 'Could not install update.',
      }))
    } finally {
      setIsInstallingUpdate(false)
    }
  }

  function exportTxt() {
    if (!result) return
    const blob = new Blob([transcriptText], {
      type: 'text/plain;charset=utf-8',
    })
    downloadBlob(blob, `${baseName}-timestamped.txt`)
  }

  async function exportDocx() {
    if (!result) return

    const { Document, Packer, Paragraph, TextRun } = await import('docx')
    const doc = new Document({
      creator: appName,
      title: `${baseName} transcript`,
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: appName,
                  bold: true,
                  size: 32,
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `${result.segments.length} segments | ${duration || 'unknown duration'} | ${result.device} ${result.computeType} | detected ${result.language}`,
                  color: '5B6570',
                }),
              ],
            }),
            ...result.segments.flatMap((segment) => [
              new Paragraph({
                spacing: { before: 220 },
                children: [
                  new TextRun({
                    text: `${segment.start} - ${segment.end}`,
                    bold: true,
                    color: '146C63',
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: segment.text,
                    size: 24,
                  }),
                ],
              }),
            ]),
          ],
        },
      ],
    })

    const blob = await Packer.toBlob(doc)
    downloadBlob(blob, `${baseName}-timestamped.docx`)
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="masthead">
          <div>
            <p className="eyebrow">{appName}</p>
            <h1>Polish every line after AI transcription.</h1>
          </div>
          <div className="status-pill">
            <Languages size={18} aria-hidden="true" />
            Editable local AI
          </div>
        </div>

        <div className="update-strip">
          <div>
            <strong>App updates</strong>
            <span>
              {updateStatus
                ? `${updateStatus.message}${updateStatus.remoteCommit ? ` Remote ${updateStatus.remoteCommit}` : ''}`
                : 'Check whether a newer GitHub version is available.'}
            </span>
          </div>
          <div className="update-actions">
            <button type="button" onClick={checkForUpdates} disabled={isCheckingUpdate || isInstallingUpdate}>
              <RefreshCw className={isCheckingUpdate ? 'spin' : ''} size={17} aria-hidden="true" />
              {isCheckingUpdate ? 'Checking...' : 'Check'}
            </button>
            <button
              type="button"
              onClick={installUpdate}
              disabled={!updateStatus?.updateAvailable || !updateStatus.canInstall || isInstallingUpdate}
            >
              <Download size={17} aria-hidden="true" />
              {isInstallingUpdate ? 'Installing...' : 'Install'}
            </button>
          </div>
        </div>

        <div className="controls">
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
            }}
          >
            <input
              ref={inputRef}
              className="file-input"
              type="file"
              accept=".m4a,.mp3,.wav,.mp4,.aac,audio/*"
              onChange={onFileChange}
            />
            <FileAudio size={36} aria-hidden="true" />
            <div>
              <strong>{file ? file.name : 'Drop audio into the studio'}</strong>
              <span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'M4A, MP3, WAV, MP4, AAC'}</span>
            </div>
          </div>

          <div className="settings">
            <label>
              Language
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="ko">Korean</option>
                <option value="auto">Auto detect</option>
              </select>
            </label>

            <label>
              Model
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                <option value="base">Base - faster</option>
                <option value="small">Small - balanced</option>
                <option value="medium">Medium - higher quality</option>
              </select>
            </label>

            <label>
              Engine
              <select value={device} onChange={(event) => setDevice(event.target.value)}>
                <option value="auto">Auto - use GPU if available</option>
                <option value="cuda">GPU - NVIDIA CUDA</option>
                <option value="cpu">CPU - compatibility mode</option>
              </select>
            </label>

            <button className="primary-button" type="button" onClick={transcribe} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}
              {isLoading ? 'Transcribing...' : 'Transcribe'}
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="processing-gauge" role="status" aria-live="polite">
            <div>
              <strong>Processing audio</strong>
              <span>
                {device === 'cpu' ? 'CPU' : device === 'cuda' ? 'GPU' : 'Auto engine'} is transcribing your file.
              </span>
            </div>
            <div className="meter" aria-hidden="true">
              <span />
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <section className="result-panel" aria-live="polite">
          <div className="result-header">
            <div>
              <h2>Transcript</h2>
              {result && (
                <p>
                  {result.segments.length} editable lines, {duration}, {result.device} {result.computeType}, detected {result.language}
                </p>
              )}
            </div>
            <div className="actions">
              <button type="button" onClick={copyTranscript} disabled={!result} title="Copy transcript">
                <Clipboard size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={exportTxt} disabled={!result} title="Export TXT">
                <Download size={18} aria-hidden="true" />
                <span>TXT</span>
              </button>
              <button type="button" onClick={exportDocx} disabled={!result} title="Export DOCX">
                <FileText size={18} aria-hidden="true" />
                <span>DOCX</span>
              </button>
            </div>
          </div>

          {result ? (
            <ol className="segments">
              {result.segments.map((segment) => (
                <li key={segment.id}>
                  <time>
                    {segment.start} - {segment.end}
                  </time>
                  <textarea
                    aria-label={`Transcript line ${segment.id}`}
                    value={segment.text}
                    onChange={(event) => updateSegmentText(segment.id, event.target.value)}
                    rows={2}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">
              Upload audio to generate timestamped text, then click any line to correct it.
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
