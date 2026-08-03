import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Download, Maximize2, Pause, Play } from 'lucide-react'
import { buildWavePeaks, clamp, formatClock } from './audioUtils'
import type { AudioSelection } from './audioUtils'

type AudioWaveEditorProps = {
  file: File
  selection: AudioSelection | null
  disabled?: boolean
  onSelectionChange: (selection: AudioSelection) => void
  onDownloadCut: () => void
}

const peakCount = 260
const canvasWidth = 1040
const canvasHeight = 150

function AudioWaveEditor({
  file,
  selection,
  disabled = false,
  onSelectionChange,
  onDownloadCut,
}: AudioWaveEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const dragStartRef = useRef<number | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [audioUrl, setAudioUrl] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPreparing, setIsPreparing] = useState(true)

  const duration = selection?.duration || 0
  const selectedStart = selection?.start || 0
  const selectedEnd = selection?.end || duration
  const selectedLength = Math.max(0, selectedEnd - selectedStart)

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
    const barWidth = canvasWidth / peakCount - gap
    const startRatio = duration ? selectedStart / duration : 0
    const endRatio = duration ? selectedEnd / duration : 1
    const startX = startRatio * canvasWidth
    const endX = endRatio * canvasWidth

    peaks.forEach((peak, index) => {
      const x = index * (barWidth + gap)
      const height = Math.max(3, peak * (canvasHeight - 36))
      const isSelected = x >= startX && x <= endX
      context.fillStyle = isSelected ? '#146c63' : '#a9c8c2'
      context.fillRect(x, baseline - height / 2, barWidth, height)
    })

    context.fillStyle = 'rgba(47, 184, 159, 0.13)'
    context.fillRect(startX, 0, Math.max(2, endX - startX), canvasHeight)
    context.fillStyle = '#ffb067'
    context.fillRect(startX - 2, 0, 4, canvasHeight)
    context.fillRect(endX - 2, 0, 4, canvasHeight)
  }, [duration, peaks, selectedEnd, selectedStart])

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
    return ratio * duration
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
    if (dragStartRef.current === null) return
    updateRange(dragStartRef.current, timeFromPointer(event), true)
    dragStartRef.current = null
  }

  function useFullAudio() {
    if (!duration) return
    updateRange(0, duration, false)
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
              : selection?.isCustom
                ? `Selected ${formatClock(selectedStart)} - ${formatClock(selectedEnd)}`
                : 'Full audio selected'}
          </span>
        </div>
        <div className="wave-times">
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
      </div>
    </section>
  )
}

export default AudioWaveEditor
