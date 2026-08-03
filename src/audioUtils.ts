export type AudioSelection = {
  start: number
  end: number
  duration: number
  isCustom: boolean
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const wholeSeconds = Math.floor(safeSeconds)
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainingSeconds = wholeSeconds % 60

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

export async function decodeAudio(file: File) {
  const audioContext = new AudioContext()
  try {
    const buffer = await file.arrayBuffer()
    return await audioContext.decodeAudioData(buffer)
  } finally {
    void audioContext.close()
  }
}

export function buildWavePeaks(audioBuffer: AudioBuffer, peakCount: number) {
  const channelData = audioBuffer.getChannelData(0)
  const samplesPerPeak = Math.max(1, Math.floor(channelData.length / peakCount))
  const peaks: number[] = []

  for (let index = 0; index < peakCount; index += 1) {
    const start = index * samplesPerPeak
    const end = Math.min(channelData.length, start + samplesPerPeak)
    let peak = 0

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(channelData[sampleIndex]))
    }

    peaks.push(peak)
  }

  const maxPeak = Math.max(...peaks, 0.01)
  return peaks.map((peak) => peak / maxPeak)
}

export async function createTrimmedWav(file: File, start: number, end: number) {
  const audioBuffer = await decodeAudio(file)
  const sampleRate = audioBuffer.sampleRate
  const safeStart = clamp(start, 0, audioBuffer.duration)
  const safeEnd = clamp(end, safeStart + 0.1, audioBuffer.duration)
  const firstFrame = Math.floor(safeStart * sampleRate)
  const lastFrame = Math.max(firstFrame + 1, Math.floor(safeEnd * sampleRate))
  const channels = audioBuffer.numberOfChannels
  const channelSamples: Float32Array[] = []

  for (let channel = 0; channel < channels; channel += 1) {
    channelSamples.push(audioBuffer.getChannelData(channel).slice(firstFrame, lastFrame))
  }

  const wavBlob = encodeWav(channelSamples, sampleRate)
  const cleanName = file.name.replace(/\.[^.]+$/, '')
  const startLabel = formatTimestamp(safeStart).replaceAll(':', '-')
  const endLabel = formatTimestamp(safeEnd).replaceAll(':', '-')
  return new File([wavBlob], `${cleanName}-${startLabel}-${endLabel}.wav`, { type: 'audio/wav' })
}

function encodeWav(channels: Float32Array[], sampleRate: number) {
  const channelCount = channels.length
  const frameCount = channels[0]?.length || 0
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const dataSize = frameCount * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  let offset = 0

  function writeString(value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index))
      offset += 1
    }
  }

  writeString('RIFF')
  view.setUint32(offset, 36 + dataSize, true)
  offset += 4
  writeString('WAVE')
  writeString('fmt ')
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint16(offset, channelCount, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, sampleRate * blockAlign, true)
  offset += 4
  view.setUint16(offset, blockAlign, true)
  offset += 2
  view.setUint16(offset, bytesPerSample * 8, true)
  offset += 2
  writeString('data')
  view.setUint32(offset, dataSize, true)
  offset += 4

  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = clamp(channels[channel][frame] || 0, -1, 1)
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
