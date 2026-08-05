import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Download, Maximize2, Pause, Play, Search, SkipBack, SkipForward, ZoomIn, ZoomOut } from 'lucide-react'
import { buildWavePeaks, clamp, formatClock } from './audioUtils'
import type { AudioSelection } from './audioUtils'

export type TranscriptMarker = {
  id: number
  start: number
  end: number
  isActive: boolean
  isMatch: boolean
}

type AudioWaveEditorProps = {
  file: File
  selection: AudioSelection | null
  transcriptMarkers?: TranscriptMarker[]
  disabled?: boolean
  onSelectionChange: (selection: AudioSelection) => void
  onDownloadCut: () => void
  onMarkerSelect?: (id: number) => void
}

const peakCount = 260
const canvasWidth = 1040
const canvasHeight = 150

function AudioWaveEditor({
  file,
  selection,
  transcriptMarkers = [],
  disabled = false,
  onSelectionChange,
  onDownloadCut,
  onMarkerSelect,
}: AudioWaveEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const dragStartRef = useRef<number | null>(null)
  const markerPointerRef = useRef<number | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [audioUrl, setAudioUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPreparing, setIsPreparing] = useState(true)
  const [viewStart, setViewStart] = useState(0)
  const [viewEnd, setViewEnd] = useState(0)

  const duration = selection?.duration || 0
  const selectedStart = selection?.start || 0
  const selectedEnd = selection?.end || duration
  const selectedLength = Math.max(0, selectedEnd - selectedStart)
  const visibleStart = clamp(viewStart, 0, duration)
  const visibleEnd = viewEnd > visibleStart ? clamp(viewEnd, visibleStart, duration) : duration
  const visibleDuration = Math.max(0.1, visibleEnd - visibleStart)
  const hasMarkers = transcriptMarkers.some((marker) => marker.isActive || marker.isMatch)

  const timeToX = useCallback(
    (time: number) => ((time - visibleStart) / visibleDuration) * canvasWidth,
    [visibleDuration, visibleStart],
  )

  useEffect(() => {
    let isCancelled = false
    const nextUrl = URL.createObjectURL(file)
    setAudioUrl(nextUrl)
    setPeaks([])
    setIsPreparing(true)

    const audioContext = new AudioContext()

    file
      .arrayBuffer()
      .then((buffer) => audioContext.decodeAudioData(buffer))
      .then((audioBuffer) => {
        if (isCancelled) return
        setPeaks(buildWavePeaks(audioBuffer, peakCount))
        onSelectionChange({
          start: 0,
          end: audioBuffer.duration,
          duration: audioBuffer.duration,
          isCustom: false,
        })
        setViewStart(0)
        setViewEnd(audioBuffer.duration)
      })
      .catch(() => {
        if (!isCancelled) setPeaks([])
      })
      .finally(() => {
        if (!isCancelled) setIsPreparing(false)
        void audioContext.close()
      })

    return () => {
      isCancelled = true
      URL.revokeObjectURL(nextUrl)
      void audioContext.close()
    }
  }, [file, onSelectionChange])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    context.clearRect(0, 0, canvasWidth, canvasHeight)
    context.fillStyle = '#f8fbfa'
    context.fillRect(0, 0, canvasWidth, canvasHeight)

    const baseline = canvasHeight / 2
    const gap = 2
    const startX = timeToX(selectedStart)
    const endX = timeToX(selectedEnd)
    const firstPeak = Math.max(0, Math.floor((visibleStart / Math.max(duration, 0.1)) * peakCount))
    const lastPeak = Math.min(peakCount, Math.ceil((visibleEnd / Math.max(duration, 0.1)) * peakCount))
    const visiblePeakCount = Math.max(1, lastPeak - firstPeak)
    const barWidth = canvasWidth / visiblePeakCount - gap

    peaks.slice(firstPeak, lastPeak).forEach((peak, index) => {
      const absoluteIndex = firstPeak + index
      const x = timeToX((absoluteIndex / peakCount) * duration)
      const height = Math.max(3, peak * (canvasHeight - 36))
      const isSelected = x + barWidth >= startX && x <= endX
      context.fillStyle = isSelected ? '#146c63' : '#a9c8c2'
      context.fillRect(x, baseline - height / 2, barWidth, height)
    })

    context.fillStyle = 'rgba(47, 184, 159, 0.13)'
    context.fillRect(clamp(startX, 0, canvasWidth), 0, Math.max(2, clamp(endX, 0, canvasWidth) - clamp(startX, 0, canvasWidth)), canvasHeight)
    context.fillStyle = '#ffb067'
    context.fillRect(clamp(startX, 0, canvasWidth) - 2, 0, 4, canvasHeight)
    context.fillRect(clamp(endX, 0, canvasWidth) - 2, 0, 4, canvasHeight)

    transcriptMarkers
      .filter((marker) => marker.isActive || marker.isMatch)
      .filter((marker) => marker.end >= visibleStart && marker.start <= visibleEnd)
      .forEach((marker) => {
        const markerStart = clamp(timeToX(marker.start), 0, canvasWidth)
        const markerEnd = clamp(timeToX(Math.max(marker.end, marker.start + 0.4)), 0, canvasWidth)
        const width = Math.max(4, markerEnd - markerStart)
        const color = marker.isActive ? '#d93f2f' : '#ff6b5a'

        context.fillStyle = marker.isActive ? 'rgba(217, 63, 47, 0.28)' : 'rgba(255, 107, 90, 0.18)'
        context.fillRect(markerStart, 0, width, canvasHeight)
        context.fillStyle = color
        context.fillRect(markerStart, 0, marker.isActive ? 5 : 3, canvasHeight)
        context.beginPath()
        context.arc(markerStart + width / 2, marker.isActive ? 23 : 31, marker.isActive ? 8 : 6, 0, Math.PI * 2)
        context.fill()
      })
  }, [duration, peaks, selectedEnd, selectedStart, timeToX, transcriptMarkers, visibleEnd, visibleStart])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isPlaying) return undefined

    const timer = window.setInterval(() => {
      if (audio.currentTime >= selectedEnd) {
        audio.pause()
        setIsPlaying(false)
      }
    }, 100)

    return () => window.clearInterval(timer)
  }, [isPlaying, selectedEnd])

  function timeFromPointer(event: PointerEvent<HTMLCanvasElement>) {
    if (!duration) return 0
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    return visibleStart + ratio * visibleDuration
  }

  function markerFromPointer(event: PointerEvent<HTMLCanvasElement>) {
    if (!duration || !onMarkerSelect) return null
    const pointerTime = timeFromPointer(event)
    const tolerance = visibleDuration * 0.015

    return transcriptMarkers
      .filter((marker) => marker.isActive || marker.isMatch)
      .find((marker) => pointerTime >= marker.start - tolerance && pointerTime <= marker.end + tolerance)
  }

  function updateRange(start: number, end: number, custom = true) {
    const safeStart = clamp(Math.min(start, end), 0, duration)
    const safeEnd = clamp(Math.max(start, end), safeStart + 0.1, duration)
    onSelectionChange({
      start: safeStart,
      end: safeEnd,
      duration,
      isCustom: custom && (safeStart > 0.05 || safeEnd < duration - 0.05),
    })
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!duration || disabled) return
    const marker = markerFromPointer(event)
    if (marker) {
      markerPointerRef.current = marker.id
      return
    }

    const time = timeFromPointer(event)
    dragStartRef.current = time
    event.currentTarget.setPointerCapture(event.pointerId)
    updateRange(time, Math.min(duration, time + Math.min(30, duration)), true)
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (dragStartRef.current === null || disabled) return
    updateRange(dragStartRef.current, timeFromPointer(event), true)
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (markerPointerRef.current !== null) {
      onMarkerSelect?.(markerPointerRef.current)
      markerPointerRef.current = null
      return
    }

    if (dragStartRef.current === null) return
    updateRange(dragStartRef.current, timeFromPointer(event), true)
    dragStartRef.current = null
  }

  function useFullAudio() {
    if (!duration) return
    updateRange(0, duration, false)
  }

  function fitTimeline() {
    setViewStart(0)
    setViewEnd(duration)
  }

  function zoomTimeline(direction: 1 | -1) {
    if (!duration) return
    const center = visibleStart + visibleDuration / 2
    const nextDuration = clamp(
      direction === 1 ? visibleDuration * 0.55 : visibleDuration / 0.55,
      Math.min(15, duration),
      duration,
    )
    const nextStart = clamp(center - nextDuration / 2, 0, duration - nextDuration)
    setViewStart(nextStart)
    setViewEnd(nextStart + nextDuration)
  }

  function panTimeline(direction: 1 | -1) {
    if (!duration) return
    const shift = visibleDuration * 0.45 * direction
    const nextStart = clamp(visibleStart + shift, 0, duration - visibleDuration)
    setViewStart(nextStart)
    setViewEnd(nextStart + visibleDuration)
  }

  async function playSelection() {
    const audio = audioRef.current
    if (!audio || disabled) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      return
    }

    audio.currentTime = selectedStart
    await audio.play()
    setIsPlaying(true)
  }

  return (
    <section className="wave-editor" aria-label="Audio cut editor">
      <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)}>
        <track kind="captions" />
      </audio>

      <div className="wave-heading">
        <div>
          <strong>Audio range</strong>
          <span>
            {isPreparing
              ? 'Reading waveform...'
              : hasMarkers
                ? 'Transcript markers are mapped on the waveform'
              : selection?.isCustom
                ? `Selected ${formatClock(selectedStart)} - ${formatClock(selectedEnd)}`
                : 'Full audio selected'}
          </span>
        </div>
        <div className="wave-times">
          <span>{formatClock(visibleStart)} - {formatClock(visibleEnd)}</span>
          <span>{formatClock(selectedLength || duration)}</span>
          <span>{formatClock(duration)}</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="wave-canvas"
        width={canvasWidth}
        height={canvasHeight}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <div className="wave-map-legend">
        <span>
          <Search size={14} aria-hidden="true" />
          Red markers jump to matching or active transcript lines.
        </span>
      </div>

      <div className="wave-toolbar">
        <button type="button" onClick={playSelection} disabled={!duration || disabled} title="Play selected range">
          {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          <span>{isPlaying ? 'Pause' : 'Play cut'}</span>
        </button>
        <button type="button" onClick={useFullAudio} disabled={!duration || disabled} title="Use full audio">
          <Maximize2 size={17} aria-hidden="true" />
          <span>Full audio</span>
        </button>
        <button
          type="button"
          onClick={onDownloadCut}
          disabled={!selection?.isCustom || disabled}
          title="Download selected cut as WAV"
        >
          <Download size={17} aria-hidden="true" />
          <span>Cut WAV</span>
        </button>
        <button type="button" onClick={() => panTimeline(-1)} disabled={!duration || disabled} title="Move timeline left">
          <SkipBack size={17} aria-hidden="true" />
          <span>Left</span>
        </button>
        <button type="button" onClick={() => panTimeline(1)} disabled={!duration || disabled} title="Move timeline right">
          <SkipForward size={17} aria-hidden="true" />
          <span>Right</span>
        </button>
        <button type="button" onClick={() => zoomTimeline(1)} disabled={!duration || disabled} title="Zoom in">
          <ZoomIn size={17} aria-hidden="true" />
          <span>Zoom</span>
        </button>
        <button type="button" onClick={() => zoomTimeline(-1)} disabled={!duration || disabled} title="Zoom out">
          <ZoomOut size={17} aria-hidden="true" />
          <span>Out</span>
        </button>
        <button type="button" onClick={fitTimeline} disabled={!duration || disabled} title="Fit full timeline">
          <Maximize2 size={17} aria-hidden="true" />
          <span>Fit</span>
        </button>
      </div>
    </section>
  )
}

export default AudioWaveEditor
