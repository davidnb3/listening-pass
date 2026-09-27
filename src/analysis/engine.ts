import { getAudioContext } from '../audio'
import { buildReport } from './rules'
import type { Report } from './types'

const MAX_SECONDS = 10 * 60
const MIN_SECONDS = 3

let worker: Worker | null = null
let rejectCurrent: ((error: Error) => void) | null = null

function cancelled(): Error {
  const error = new Error('cancelled')
  error.name = 'AbortError'
  return error
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function analyzeFile(
  file: File,
  onProgress: (ratio: number) => void,
): Promise<{ report: Report; buffer: AudioBuffer }> {
  rejectCurrent?.(cancelled())
  worker?.terminate()
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const active = worker

  return new Promise((resolve, reject) => {
    rejectCurrent = reject
    const held: { buffer: AudioBuffer | null } = { buffer: null }
    active.onerror = () => {
      reject(new Error('The listening engine stopped before it finished.'))
    }
    active.onmessage = (event: MessageEvent<{ type: string; ratio?: number; metrics?: Report['metrics']; message?: string }>) => {
      const data = event.data
      if (data.type === 'progress' && typeof data.ratio === 'number') {
        onProgress(Math.max(0.05, Math.min(1, data.ratio)))
        return
      }
      if (data.type === 'error') {
        rejectCurrent = null
        reject(new Error(data.message || 'The mix could not be read.'))
        return
      }
      if (data.type === 'result' && data.metrics) {
        rejectCurrent = null
        if (!held.buffer) {
          reject(new Error('The mix could not be read.'))
          return
        }
        onProgress(1)
        resolve({ report: buildReport(data.metrics), buffer: held.buffer })
      }
    }

    decode(file)
      .then((decoded) => {
        if (active !== worker) return
        held.buffer = decoded.buffer
        onProgress(0.05)
        active.postMessage(
          { left: decoded.left, right: decoded.right, sampleRate: decoded.sampleRate, mono: decoded.mono },
          [decoded.left.buffer, decoded.right.buffer],
        )
      })
      .catch((error: unknown) => {
        if (active !== worker) return
        rejectCurrent = null
        reject(error instanceof Error ? error : new Error('This file could not be read.'))
      })
  })
}

async function decode(file: File): Promise<{
  buffer: AudioBuffer
  left: Float32Array
  right: Float32Array
  sampleRate: number
  mono: boolean
}> {
  const context = getAudioContext()
  try {
    const encoded = await file.arrayBuffer()
    const audio = await context.decodeAudioData(encoded)
    if (audio.duration < MIN_SECONDS) {
      throw new Error('This pass needs at least a few seconds of audio.')
    }
    if (audio.duration > MAX_SECONDS) {
      throw new Error('This pass listens to mixes up to 10 minutes.')
    }
    const left = new Float32Array(audio.getChannelData(0))
    const mono = audio.numberOfChannels < 2
    const right = mono ? left.slice() : new Float32Array(audio.getChannelData(1))
    return { buffer: audio, left, right, sampleRate: audio.sampleRate, mono }
  } catch (error) {
    if (error instanceof Error && /pass|minutes|seconds/.test(error.message)) throw error
    throw new Error('This file could not be read. WAV, MP3, and AAC work best in this browser.')
  }
}
