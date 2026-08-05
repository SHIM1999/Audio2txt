import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Clipboard,
  Download,
  FileAudio,
  FileText,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings,
  Upload,
  X,
} from 'lucide-react'
import './App.css'
import AudioWaveEditor from './AudioWaveEditor'
import type { TranscriptMarker } from './AudioWaveEditor'
import MascotSticker from './MascotSticker'
import { createTrimmedWav, formatTimestamp } from './audioUtils'
import type { AudioSelection } from './audioUtils'

type Segment = {
  id: number
  start: string
  end: string
  startSeconds?: number
  endSeconds?: number
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
  warning?: string
}

type UpdateStatus = {
  currentVersion: string
  currentCommit: string
  latestVersion?: string
  localBranch?: string
  remoteCommit?: string
  remoteDate?: string
  releaseUrl?: string
  assetName?: string
  mode?: 'portable' | 'git' | 'desktop'
  updateAvailable: boolean
  canInstall: boolean
  message: string
}

declare global {
  interface Window {
    audio2txtDesktop?: {
      version: () => Promise<string>
      getExportFolder: () => Promise<string>
      chooseExportFolder: () => Promise<{ canceled?: boolean; exportFolder: string }>
      clearExportFolder: () => Promise<{ exportFolder: string }>
      saveExportFile: (payload: { filename: string; content: string | ArrayBuffer }) => Promise<{ ok?: boolean; path?: string; message?: string }>
      checkForUpdates: () => Promise<{ updateAvailable?: boolean; message?: string; version?: string; releaseUrl?: string; assetName?: string; canInstall?: boolean }>
      downloadUpdate: () => Promise<{ ok?: boolean; message?: string }>
      repairUpdateCache: () => Promise<{ ok?: boolean; message?: string; path?: string }>
      restartToUpdate: () => Promise<void>
      onUpdateAvailable: (callback: (payload: { version?: string }) => void) => void
      onUpdateNotAvailable: (callback: (payload: { version?: string }) => void) => void
      onUpdateDownloaded: (callback: (payload: { ready?: boolean }) => void) => void
      onUpdateError: (callback: (message: string) => void) => void
    }
  }
}

const apiUrl = 'http://localhost:3001/api/transcribe'
const updateCheckUrl = 'http://localhost:3001/api/update/check'
const updateInstallUrl = 'http://localhost:3001/api/update/install'
const appName = 'Audio2txt'
const qualityModel = 'medium'

function textMatches(value: string, query: string, caseSensitive: boolean) {
  const cleanQuery = query.trim()
  if (!cleanQuery) return false

  return caseSensitive
    ? value.includes(cleanQuery)
    : value.toLocaleLowerCase().includes(cleanQuery.toLocaleLowerCase())
}

function buildTimestampedText(segments: Segment[]) {
  return segments.map((segment) => `[${segment.start} - ${segment.end}] ${segment.text}`).join('\n')
}

function shiftSegments(segments: Segment[], offsetSeconds: number) {
  if (!offsetSeconds) return segments

  return segments.map((segment) => {
    const startSeconds = (segment.startSeconds ?? 0) + offsetSeconds
    const endSeconds = (segment.endSeconds ?? startSeconds) + offsetSeconds

    return {
      ...segment,
      startSeconds,
      endSeconds,
      start: formatTimestamp(startSeconds),
      end: formatTimestamp(endSeconds),
    }
  })
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
  const segmentRefs = useRef(new Map<number, HTMLTextAreaElement>())
  const [file, setFile] = useState<File | null>(null)
  const [audioSelection, setAudioSelection] = useState<AudioSelection | null>(null)
  const [language, setLanguage] = useState('ko')
  const [device, setDevice] = useState('auto')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [exportFolder, setExportFolder] = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const [findQuery, setFindQuery] = useState('')
  const [isFindCaseSensitive, setIsFindCaseSensitive] = useState(false)
  const [shouldAutoFocusMatch, setShouldAutoFocusMatch] = useState(true)
  const [pendingMatchFocus, setPendingMatchFocus] = useState(false)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCutting, setIsCutting] = useState(false)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false)
  const [isRepairingUpdate, setIsRepairingUpdate] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
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

  const matchedSegments = useMemo(() => {
    if (!result || !findQuery.trim()) return []
    return result.segments.filter((segment) => textMatches(segment.text, findQuery, isFindCaseSensitive))
  }, [findQuery, isFindCaseSensitive, result])

  const activeMatchId = matchedSegments[activeMatchIndex]?.id

  const transcriptMarkers = useMemo<TranscriptMarker[]>(() => {
    if (!result) return []

    return result.segments
      .filter((segment) => typeof segment.startSeconds === 'number' && typeof segment.endSeconds === 'number')
      .map((segment) => ({
        id: segment.id,
        start: segment.startSeconds || 0,
        end: segment.endSeconds || segment.startSeconds || 0,
        isActive: segment.id === activeSegmentId || segment.id === activeMatchId,
        isMatch: textMatches(segment.text, findQuery, isFindCaseSensitive),
      }))
  }, [activeMatchId, activeSegmentId, findQuery, isFindCaseSensitive, result])

  useEffect(() => {
    if (!isLoading) {
      setElapsedSeconds(0)
      return undefined
    }

    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isLoading])

  useEffect(() => {
    setActiveMatchIndex(0)
    if (result && findQuery.trim() && shouldAutoFocusMatch) {
      setPendingMatchFocus(true)
    }
  }, [findQuery, isFindCaseSensitive, result, shouldAutoFocusMatch])

  useEffect(() => {
    if (!pendingMatchFocus || !activeMatchId) return
    focusSegment(activeMatchId)
    setPendingMatchFocus(false)
  }, [activeMatchId, pendingMatchFocus])

  useEffect(() => {
    const desktop = window.audio2txtDesktop
    if (!desktop) return undefined

    desktop.getExportFolder().then(setExportFolder).catch(() => setExportFolder(''))

    desktop.onUpdateAvailable((payload) => {
      setUpdateStatus((current) => ({
        currentVersion: current?.currentVersion || 'desktop',
        currentCommit: current?.currentCommit || 'installer',
        latestVersion: payload.version || 'newer',
        mode: 'desktop',
        updateAvailable: true,
        canInstall: false,
        message: 'Installer update found. Downloading in the background...',
      }))
    })

    desktop.onUpdateDownloaded(() => {
      setUpdateStatus((current) => ({
        currentVersion: current?.currentVersion || 'desktop',
        currentCommit: current?.currentCommit || 'installer',
        latestVersion: current?.latestVersion || 'newer',
        mode: 'desktop',
        updateAvailable: true,
        canInstall: true,
        message: 'Installer update downloaded. Click Install to restart into the new version.',
      }))
    })

    desktop.onUpdateNotAvailable(() => {
      setUpdateStatus((current) => ({
        currentVersion: current?.currentVersion || 'desktop',
        currentCommit: current?.currentCommit || 'installer',
        mode: 'desktop',
        updateAvailable: false,
        canInstall: false,
        message: 'You are on the latest installed version.',
      }))
    })

    desktop.onUpdateError((message) => {
      setUpdateStatus((current) => ({
        currentVersion: current?.currentVersion || 'desktop',
        currentCommit: current?.currentCommit || 'installer',
        mode: 'desktop',
        updateAvailable: false,
        canInstall: false,
        message,
      }))
    })

    return undefined
  }, [])

  async function chooseExportFolder() {
    if (!window.audio2txtDesktop) return

    const payload = await window.audio2txtDesktop.chooseExportFolder()
    setExportFolder(payload.exportFolder || '')
    setExportStatus(payload.canceled ? '' : 'Export folder saved.')
  }

  async function clearExportFolder() {
    if (!window.audio2txtDesktop) return

    const payload = await window.audio2txtDesktop.clearExportFolder()
    setExportFolder(payload.exportFolder || '')
    setExportStatus('Export folder cleared.')
  }

  function pickFile(nextFile?: File) {
    if (!nextFile) return
    setFile(nextFile)
    setAudioSelection(null)
    setResult(null)
    setActiveSegmentId(null)
    segmentRefs.current.clear()
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

    try {
      let uploadFile = file
      let timestampOffset = 0

      if (audioSelection?.isCustom) {
        setIsCutting(true)
        uploadFile = await createTrimmedWav(file, audioSelection.start, audioSelection.end)
        timestampOffset = audioSelection.start
        setIsCutting(false)
      }

      const formData = new FormData()
      formData.append('audio', uploadFile)
      formData.append('model', qualityModel)
      formData.append('language', language)
      formData.append('device', device)

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Transcription failed.')
      }

      const segments = shiftSegments(payload.segments, timestampOffset)

      setResult({
        ...payload,
        duration: audioSelection?.isCustom ? audioSelection.end - audioSelection.start : payload.duration,
        segments,
        timestampedText: buildTimestampedText(segments),
        plainText: segments.map((segment: Segment) => segment.text).join('\n'),
      })
      setPendingMatchFocus(shouldAutoFocusMatch && Boolean(findQuery.trim()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transcription failed.')
    } finally {
      setIsLoading(false)
      setIsCutting(false)
    }
  }

  async function downloadSelectedCut() {
    if (!file || !audioSelection?.isCustom) return

    setIsCutting(true)
    setError('')

    try {
      const cutFile = await createTrimmedWav(file, audioSelection.start, audioSelection.end)
      downloadBlob(cutFile, cutFile.name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare the audio cut.')
    } finally {
      setIsCutting(false)
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

  function setSegmentRef(id: number, element: HTMLTextAreaElement | null) {
    if (element) {
      segmentRefs.current.set(id, element)
      return
    }

    segmentRefs.current.delete(id)
  }

  function focusSegment(id: number) {
    const element = segmentRefs.current.get(id)
    if (!element) return

    setActiveSegmentId(id)
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => {
      element.focus()
    }, 160)
  }

  function moveMatch(direction: 1 | -1) {
    if (!matchedSegments.length) return
    const nextIndex = (activeMatchIndex + direction + matchedSegments.length) % matchedSegments.length
    setActiveMatchIndex(nextIndex)
    setActiveSegmentId(matchedSegments[nextIndex].id)
    focusSegment(matchedSegments[nextIndex].id)
  }

  function selectTranscriptMarker(id: number) {
    const matchIndex = matchedSegments.findIndex((segment) => segment.id === id)
    if (matchIndex >= 0) {
      setActiveMatchIndex(matchIndex)
    }

    focusSegment(id)
  }

  function clearFindQuery() {
    setFindQuery('')
    setActiveMatchIndex(0)
  }

  async function copyTranscript() {
    if (!result) return
    await navigator.clipboard.writeText(transcriptText)
  }

  async function checkForUpdates() {
    setIsCheckingUpdate(true)
    setUpdateStatus(null)

    try {
      if (window.audio2txtDesktop) {
        const currentVersion = await window.audio2txtDesktop.version()
        const payload = await window.audio2txtDesktop.checkForUpdates()
        setUpdateStatus({
          currentVersion,
          currentCommit: 'installer',
          latestVersion: payload.version,
          updateAvailable: Boolean(payload.updateAvailable),
          canInstall: Boolean(payload.canInstall),
          releaseUrl: payload.releaseUrl,
          assetName: payload.assetName,
          mode: 'desktop',
          message: payload.message || 'Checking for installer updates...',
        })
        return
      }

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

  async function repairUpdateCache() {
    if (!window.audio2txtDesktop) return

    setIsRepairingUpdate(true)

    try {
      const payload = await window.audio2txtDesktop.repairUpdateCache()
      setUpdateStatus({
        currentVersion: await window.audio2txtDesktop.version(),
        currentCommit: 'installer',
        updateAvailable: false,
        canInstall: false,
        mode: 'desktop',
        message: payload.message || 'Updater cache repaired. Try Check again.',
      })
    } catch (caught) {
      setUpdateStatus({
        currentVersion: 'unknown',
        currentCommit: 'installer',
        updateAvailable: false,
        canInstall: false,
        mode: 'desktop',
        message: caught instanceof Error ? caught.message : 'Could not repair updater cache.',
      })
    } finally {
      setIsRepairingUpdate(false)
    }
  }

  async function installUpdate() {
    setIsInstallingUpdate(true)

    try {
      if (updateStatus?.mode === 'desktop' && window.audio2txtDesktop) {
        await window.audio2txtDesktop.restartToUpdate()
        return
      }

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

  function openRelease() {
    if (!updateStatus?.releaseUrl) return
    window.open(updateStatus.releaseUrl, '_blank', 'noopener,noreferrer')
  }

  async function saveOrDownload(blob: Blob, filename: string, textContent?: string) {
    if (window.audio2txtDesktop && exportFolder) {
      const content = textContent ?? await blob.arrayBuffer()
      const payload = await window.audio2txtDesktop.saveExportFile({ filename, content })

      if (!payload.ok) {
        setError(payload.message || 'Could not save export file.')
        return
      }

      setExportStatus(`Saved ${filename}`)
      return
    }

    downloadBlob(blob, filename)
  }

  async function exportTxt() {
    if (!result) return
    const blob = new Blob([transcriptText], {
      type: 'text/plain;charset=utf-8',
    })
    await saveOrDownload(blob, `${baseName}-timestamped.txt`, transcriptText)
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
    await saveOrDownload(blob, `${baseName}-timestamped.docx`)
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="masthead">
          <div>
            <p className="eyebrow">{appName}</p>
            <h1>Polish every line after AI transcription.</h1>
          </div>
          <div className="masthead-tools">
            <button
              className="icon-button settings-toggle"
              type="button"
              onClick={() => setIsSettingsOpen((current) => !current)}
              title="Open settings"
              aria-expanded={isSettingsOpen}
              aria-label="Open settings"
            >
              <Settings size={21} aria-hidden="true" />
            </button>
            <MascotSticker />
          </div>
        </div>

        {isSettingsOpen && (
          <section className="settings-panel" aria-label="Settings">
            <div className="settings-panel-header">
              <div>
                <strong>Settings</strong>
                <span>Transcript focus and review helpers</span>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                title="Close settings"
                aria-label="Close settings"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="find-setting">
              <div className="export-setting">
                <div>
                  <strong>Export folder</strong>
                  <span>
                    {window.audio2txtDesktop
                      ? exportFolder || 'No folder selected. Exports will use browser downloads.'
                      : 'Available in the installed desktop app.'}
                  </span>
                </div>
                <div className="export-actions">
                  <button type="button" onClick={chooseExportFolder} disabled={!window.audio2txtDesktop}>
                    <FolderOpen size={17} aria-hidden="true" />
                    Choose
                  </button>
                  <button type="button" onClick={clearExportFolder} disabled={!window.audio2txtDesktop || !exportFolder}>
                    <X size={16} aria-hidden="true" />
                    Clear
                  </button>
                </div>
                {exportStatus && <p>{exportStatus}</p>}
              </div>

              <label>
                Focus word after transcription
                <div className="search-input">
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="text"
                    value={findQuery}
                    onChange={(event) => setFindQuery(event.target.value)}
                    placeholder="Enter word or phrase"
                  />
                  {findQuery && (
                    <button type="button" onClick={clearFindQuery} title="Clear search" aria-label="Clear search">
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </label>

              <div className="settings-row">
                <label className="check-setting">
                  <input
                    type="checkbox"
                    checked={shouldAutoFocusMatch}
                    onChange={(event) => setShouldAutoFocusMatch(event.target.checked)}
                  />
                  Auto focus first match
                </label>
                <label className="check-setting">
                  <input
                    type="checkbox"
                    checked={isFindCaseSensitive}
                    onChange={(event) => setIsFindCaseSensitive(event.target.checked)}
                  />
                  Case sensitive
                </label>
              </div>

              <div className="match-tools">
                <span>
                  {findQuery.trim()
                    ? `${matchedSegments.length} match${matchedSegments.length === 1 ? '' : 'es'}`
                    : 'No filter set'}
                </span>
                <div>
                  <button type="button" onClick={() => moveMatch(-1)} disabled={!matchedSegments.length} title="Previous match">
                    <ChevronUp size={17} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => moveMatch(1)} disabled={!matchedSegments.length} title="Next match">
                    <ChevronDown size={17} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="update-strip">
          <div>
            <strong>App updates</strong>
            <span>
              {updateStatus
                ? `${updateStatus.message}${updateStatus.assetName ? ` Asset: ${updateStatus.assetName}` : ''}`
                : 'Portable users download newer releases. Git users can install updates here.'}
            </span>
          </div>
          <div className="update-actions">
            <button type="button" onClick={repairUpdateCache} disabled={!window.audio2txtDesktop || isCheckingUpdate || isInstallingUpdate || isRepairingUpdate}>
              <RefreshCw className={isRepairingUpdate ? 'spin' : ''} size={17} aria-hidden="true" />
              {isRepairingUpdate ? 'Repairing...' : 'Repair'}
            </button>
            <button type="button" onClick={checkForUpdates} disabled={isCheckingUpdate || isInstallingUpdate || isRepairingUpdate}>
              <RefreshCw className={isCheckingUpdate ? 'spin' : ''} size={17} aria-hidden="true" />
              {isCheckingUpdate ? 'Checking...' : 'Check'}
            </button>
            <button
              type="button"
              onClick={updateStatus?.canInstall ? installUpdate : openRelease}
              disabled={
                !updateStatus?.updateAvailable ||
                (!updateStatus.canInstall && !updateStatus.releaseUrl) ||
                isInstallingUpdate ||
                isRepairingUpdate
              }
            >
              <Download size={17} aria-hidden="true" />
              {isInstallingUpdate ? 'Installing...' : updateStatus?.canInstall ? 'Install' : 'Open release'}
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

            <div className="quality-lock">
              <span>Quality model</span>
              <strong>Medium</strong>
              <small>Best current transcription quality. For long audio, cut the range below first.</small>
            </div>

            <label>
              Engine
              <select value={device} onChange={(event) => setDevice(event.target.value)}>
                <option value="auto">Auto - use GPU if available</option>
                <option value="cuda">GPU - NVIDIA CUDA</option>
                <option value="cpu">CPU - compatibility mode</option>
              </select>
            </label>

            <button className="primary-button" type="button" onClick={transcribe} disabled={isLoading || isCutting}>
              {isLoading ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}
              {isCutting ? 'Preparing cut...' : isLoading ? 'Transcribing...' : 'Transcribe'}
            </button>
          </div>
        </div>

        {file && (
          <AudioWaveEditor
            file={file}
            selection={audioSelection}
            disabled={isLoading || isCutting}
            transcriptMarkers={transcriptMarkers}
            onSelectionChange={setAudioSelection}
            onDownloadCut={downloadSelectedCut}
            onMarkerSelect={selectTranscriptMarker}
          />
        )}

        {isLoading && (
          <div className="processing-gauge" role="status" aria-live="polite">
            <div>
              <strong>Processing audio</strong>
              <span>
                {device === 'cpu' ? 'CPU' : device === 'cuda' ? 'GPU' : 'Auto engine'} is transcribing with Medium quality.
                {' '}Elapsed {elapsedSeconds}s. First run may download the selected model.
              </span>
            </div>
            <div className="meter" aria-hidden="true">
              <span />
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}
        {result?.warning && <div className="notice">{result.warning}</div>}

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
                <li
                  key={segment.id}
                  className={[
                    textMatches(segment.text, findQuery, isFindCaseSensitive) ? 'search-match' : '',
                    segment.id === activeMatchId ? 'active-match' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <time>
                    {segment.start} - {segment.end}
                  </time>
                  <textarea
                    ref={(element) => setSegmentRef(segment.id, element)}
                    aria-label={`Transcript line ${segment.id}`}
                    value={segment.text}
                    onFocus={() => setActiveSegmentId(segment.id)}
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
