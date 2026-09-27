import Essentia, { type EssentiaVector } from 'essentia.js/dist/essentia.js-core.es.js'
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js'
import {
  alternateTempo,
  bandsFromBark,
  correlationCurve,
  downsample,
  edgeSilence,
  hermiteTruePeak,
  logSpectrum,
  loudMoments,
  lowpass,
  monoMix,
  phaseDips,
  resonancesFromSpectrum,
  samplePeak,
  signalGaps,
  silenceFaults,
  sparseTimes,
  spectralCentroid,
  stereoEnergy,
  toDbtp,
  waveformPeaks,
} from './dsp'
import type { Fault, KeyEstimate, Metrics, TempoEstimate } from './types'

type InMessage = {
  left: Float32Array
  right: Float32Array
  sampleRate: number
  mono: boolean
}

type OutMessage =
  | { type: 'progress'; ratio: number }
  | { type: 'result'; metrics: Metrics }
  | { type: 'error'; message: string }

const frameSize = 4096
const hopSize = 8192

let engine: Promise<InstanceType<typeof Essentia>> | null = null

function post(message: OutMessage) {
  self.postMessage(message)
}

function release(value: unknown) {
  if (!value || typeof value !== 'object') return
  const candidate = value as { delete?: () => void }
  if (typeof candidate.delete !== 'function') return
  try {
    candidate.delete()
  } catch {
    /* The vector was already freed. */
  }
}

function sleep(ms = 0) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function loadEssentia() {
  if (!engine) {
    engine = (async () => {
      const wasm = EssentiaWASM
      if (wasm.ready) await wasm.ready
      if (!wasm.calledRun) {
        await new Promise<void>((resolve, reject) => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            clearInterval(poll)
            resolve()
          }
          const timer = setTimeout(
            () => reject(new Error('The listening engine took too long to start.')),
            20000,
          )
          const previous = wasm.onRuntimeInitialized
          wasm.onRuntimeInitialized = () => {
            previous?.()
            finish()
          }
          const poll = setInterval(() => {
            if (wasm.calledRun) finish()
          }, 30)
        })
      }
      return new Essentia(wasm)
    })()
  }
  return engine
}

function readVector(essentia: InstanceType<typeof Essentia>, vector: EssentiaVector): Float32Array {
  const copy = essentia.vectorToArray(vector)
  release(vector)
  return copy
}

async function truePeakLinear(
  essentia: InstanceType<typeof Essentia>,
  channel: Float32Array,
  sampleRate: number,
  onStep: (ratio: number) => void,
): Promise<number> {
  try {
    const chunk = Math.max(frameSize, Math.floor(sampleRate * 1.5))
    const overlap = Math.floor(sampleRate * 0.03)
    const step = Math.max(1, chunk - overlap)
    let max = 0
    let saw = false
    for (let start = 0; start < channel.length; start += step) {
      const end = Math.min(channel.length, start + chunk)
      const slice = channel.slice(start, end)
      if (slice.length < 64) break
      const input = essentia.arrayToVector(slice)
      let output: EssentiaVector | null = null
      let peaks: EssentiaVector | null = null
      try {
        const result = essentia.TruePeakDetector(input, false, false, 4, 1, sampleRate, -70, 4)
        output = result.output
        peaks = result.peakLocations
        const samples = essentia.vectorToArray(output)
        if (samples.length >= slice.length) {
          saw = true
          const skip = start === 0 ? 0 : Math.min(samples.length - 1, overlap * 4)
          for (let i = skip; i < samples.length; i++) {
            const value = Math.abs(samples[i] ?? 0)
            if (value > max) max = value
          }
        }
      } finally {
        release(input)
        release(output)
        release(peaks)
      }
      onStep(end / channel.length)
      await sleep()
      if (end >= channel.length) break
    }
    if (!saw || max <= 0) return hermiteTruePeak(channel)
    return max
  } catch {
    return hermiteTruePeak(channel)
  }
}

async function accumulateSpectrum(
  essentia: InstanceType<typeof Essentia>,
  mono: Float32Array,
  onStep: (ratio: number) => void,
): Promise<Float64Array> {
  const bins = frameSize / 2 + 1
  const accum = new Float64Array(bins)
  const frame = new Float32Array(frameSize)
  let frames = 0
  const starts: number[] = []
  if (mono.length <= frameSize) starts.push(0)
  else {
    for (let start = 0; start + frameSize <= mono.length; start += hopSize) starts.push(start)
  }

  for (let index = 0; index < starts.length; index++) {
    const start = starts[index] ?? 0
    frame.fill(0)
    frame.set(mono.subarray(start, start + frameSize))
    const input = essentia.arrayToVector(frame)
    const windowed = essentia.Windowing(input, true, frameSize, 'hann', 0, false)
    const spectrum = essentia.Spectrum(windowed.frame, frameSize)
    const values = essentia.vectorToArray(spectrum.spectrum)
    for (let i = 0; i < values.length && i < accum.length; i++) {
      const mag = values[i] ?? 0
      accum[i] = (accum[i] ?? 0) + mag * mag
    }
    frames += 1
    release(input)
    if (windowed.frame !== input) release(windowed.frame)
    release(spectrum.spectrum)
    if (index % 8 === 0) {
      onStep((index + 1) / starts.length)
      await sleep()
    }
  }

  if (frames > 0) {
    for (let i = 0; i < accum.length; i++) accum[i] = (accum[i] ?? 0) / frames
  }
  onStep(1)
  return accum
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

async function analyze(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  monoFile: boolean,
): Promise<Metrics> {
  post({ type: 'progress', ratio: 0.08 })
  const essentia = await loadEssentia()
  post({ type: 'progress', ratio: 0.14 })

  const leftPeak = samplePeak(left)
  const rightPeak = monoFile ? { linear: leftPeak.linear, clipped: 0 } : samplePeak(right)
  const sampleLinear = Math.max(leftPeak.linear, rightPeak.linear)
  const correlation = monoFile
    ? { times: [] as number[], values: [] as number[], mean: 1, min: 1 }
    : correlationCurve(left, right, sampleRate)
  const image = stereoEnergy(left, right)
  const lowLeft = lowpass(left, sampleRate, 120)
  const lowRight = lowpass(right, sampleRate, 120)
  const lowImage = stereoEnergy(lowLeft, lowRight)
  const mono = monoMix(left, right)
  const waveform = waveformPeaks(mono, 640)
  post({ type: 'progress', ratio: 0.28 })

  const leftTrue = await truePeakLinear(essentia, left, sampleRate, (ratio) => {
    post({ type: 'progress', ratio: 0.28 + ratio * (monoFile ? 0.16 : 0.08) })
  })
  const rightTrue = monoFile
    ? leftTrue
    : await truePeakLinear(essentia, right, sampleRate, (ratio) => {
        post({ type: 'progress', ratio: 0.36 + ratio * 0.08 })
      })
  const trueLinear = Math.max(leftTrue, rightTrue)

  const leftVector = essentia.arrayToVector(left)
  const rightVector = essentia.arrayToVector(right)
  const loudness = essentia.LoudnessEBUR128(leftVector, rightVector, 0.1, sampleRate, true)
  const shortTerm = Array.from(readVector(essentia, loudness.shortTermLoudness))
  release(loudness.momentaryLoudness)
  release(leftVector)
  release(rightVector)
  post({ type: 'progress', ratio: 0.62 })

  let dynamicComplexity: number | null = null
  const monoVector = essentia.arrayToVector(mono)
  try {
    const complexity = essentia.DynamicComplexity(monoVector, 0.2, sampleRate)
    dynamicComplexity = finite(complexity.dynamicComplexity, NaN)
    if (!Number.isFinite(dynamicComplexity)) dynamicComplexity = null
  } catch {
    dynamicComplexity = null
  }
  post({ type: 'progress', ratio: 0.66 })

  const duration = left.length / sampleRate
  const edges = edgeSilence(mono, sampleRate)
  const gaps = signalGaps(mono, sampleRate)
  const faults: Fault[] = [
    ...silenceFaults(edges.start, edges.end, duration),
    ...(gaps.length > 0 && gaps.length <= 4
      ? gaps.map((gap) => ({ kind: 'gap' as const, time: gap.time, seconds: gap.seconds }))
      : []),
  ]
  faults.push(...(await indexedFaults(essentia, mono, sampleRate)))
  post({ type: 'progress', ratio: 0.74 })
  const key = await readKey(essentia, mono, sampleRate)
  post({ type: 'progress', ratio: 0.8 })
  const tempo = await readTempo(essentia, mono, sampleRate)
  post({ type: 'progress', ratio: 0.86 })

  const power = await accumulateSpectrum(essentia, mono, (ratio) => {
    post({ type: 'progress', ratio: 0.86 + ratio * 0.12 })
  })
  release(monoVector)

  const power32 = Float32Array.from(power)
  const powerVector = essentia.arrayToVector(power32)
  const bark = readVector(essentia, essentia.BarkBands(powerVector, 27, sampleRate).bands)
  release(powerVector)

  const magnitude = Float32Array.from(power, (value) => Math.sqrt(Math.max(0, value)))
  const magnitudeVector = essentia.arrayToVector(magnitude)
  let centroid = essentia.Centroid(magnitudeVector, sampleRate / 2).centroid
  release(magnitudeVector)
  if (!Number.isFinite(centroid) || centroid < 20) centroid = spectralCentroid(power, sampleRate)

  let dissonance: number | null = null
  try {
    const decibels = Float32Array.from(magnitude, (value) => 20 * Math.log10(value + 1e-12))
    const decibelVector = essentia.arrayToVector(decibels)
    const peaks = essentia.SpectralPeaks(decibelVector, -45, 8000, 16, 1500, 'frequency', sampleRate)
    release(decibelVector)
    const frequencies = Array.from(readVector(essentia, peaks.frequencies))
    const magnitudes = Array.from(readVector(essentia, peaks.magnitudes))
    const pairs = frequencies
      .map((frequency, index) => ({
        frequency,
        magnitude: 10 ** ((magnitudes[index] ?? -120) / 20),
      }))
      .filter((pair) => pair.frequency > 0 && Number.isFinite(pair.magnitude))
      .sort((a, b) => a.frequency - b.frequency)
    if (pairs.length >= 2) {
      const frequencyVector = essentia.arrayToVector(Float32Array.from(pairs, (pair) => pair.frequency))
      const magnitudeVector = essentia.arrayToVector(Float32Array.from(pairs, (pair) => pair.magnitude))
      dissonance = finite(essentia.Dissonance(frequencyVector, magnitudeVector).dissonance, NaN)
      if (!Number.isFinite(dissonance) || dissonance < 0 || dissonance > 1) dissonance = null
      release(frequencyVector)
      release(magnitudeVector)
    }
  } catch {
    dissonance = null
  }

  const integrated = finite(loudness.integratedLoudness, -120)
  const truePeakDbtp = toDbtp(trueLinear)
  const markers = [
    ...loudMoments(shortTerm, 0.1),
    ...(monoFile ? [] : phaseDips(correlation.times, correlation.values)),
  ].sort((a, b) => a.time - b.time)

  post({ type: 'progress', ratio: 1 })

  return {
    duration,
    sampleRate,
    mono: monoFile,
    integratedLufs: integrated,
    loudnessRange: finite(loudness.loudnessRange),
    dynamicComplexity,
    truePeakDbtp,
    samplePeakDbfs: toDbtp(sampleLinear),
    clippedSamples: leftPeak.clipped + rightPeak.clipped,
    crestDb: truePeakDbtp - integrated,
    centroidHz: centroid,
    dissonance,
    bands: bandsFromBark(bark, sampleRate),
    resonances: resonancesFromSpectrum(power, sampleRate),
    spectrum: logSpectrum(power, sampleRate),
    correlation: monoFile ? 1 : correlation.mean,
    width: monoFile ? 0 : image.width,
    lowEndWidth: monoFile ? 0 : lowImage.width,
    balance: monoFile ? 0 : image.balance,
    markers,
    waveform,
    loudness: downsample(shortTerm),
    correlationOverTime: monoFile ? [] : downsample(correlation.values),
    faults,
    key,
    tempo,
  }
}

function asNumbers(essentia: InstanceType<typeof Essentia>, value: unknown): number[] {
  if (!value) return []
  if (value instanceof Float32Array) return Array.from(value)
  if (Array.isArray(value)) return value.map((item) => Number(item))
  try {
    return Array.from(readVector(essentia, value as EssentiaVector))
  } catch {
    release(value)
    return []
  }
}

async function indexedFaults(
  essentia: InstanceType<typeof Essentia>,
  channel: Float32Array,
  sampleRate: number,
): Promise<Fault[]> {
  const clicks: number[] = []
  const dropouts: number[] = []
  const bursts: number[] = []
  const chunk = Math.max(frameSize, Math.floor(sampleRate * 15))
  const overlap = Math.floor(sampleRate * 0.25)
  const step = Math.max(1, chunk - overlap)
  for (let offset = 0; offset < channel.length; offset += step) {
    const slice = channel.slice(offset, Math.min(channel.length, offset + chunk))
    if (slice.length < 512) break
    const input = essentia.arrayToVector(slice)
    try {
      try {
        const click = essentia.ClickDetector(input, 35, 512, 256, 12, 10, sampleRate, -50)
        clicks.push(...indexesToTimes(asNumbers(essentia, click.starts), offset, slice.length, overlap, sampleRate))
        release(click.ends)
      } catch {
        /* Clicks on this slice stay unchecked. */
      }
      try {
        const discontinuity = essentia.DiscontinuityDetector(input, 12, -60, 512, 256, 7, 3, -50, 32)
        dropouts.push(
          ...indexesToTimes(
            asNumbers(essentia, discontinuity.discontinuityLocations),
            offset,
            slice.length,
            overlap,
            sampleRate,
          ),
        )
        release(discontinuity.discontinuityAmplitudes)
      } catch {
        /* Dropouts on this slice stay unchecked. */
      }
      try {
        const burst = essentia.NoiseBurstDetector(input, 0.9, -50, 14)
        bursts.push(...indexesToTimes(asNumbers(essentia, burst.indexes), offset, slice.length, overlap, sampleRate))
      } catch {
        /* Bursts on this slice stay unchecked. */
      }
    } finally {
      release(input)
    }
    await sleep()
  }
  return [
    ...sparseTimes(clicks, 6).map((time) => ({ kind: 'click' as const, time, seconds: 0 })),
    ...sparseTimes(dropouts, 6).map((time) => ({ kind: 'dropout' as const, time, seconds: 0 })),
    ...sparseTimes(bursts, 4, 0.08).map((time) => ({ kind: 'burst' as const, time, seconds: 0 })),
  ]
}

function indexesToTimes(values: number[], offset: number, length: number, overlap: number, sampleRate: number): number[] {
  const times: number[] = []
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) continue
    const index = value < length ? value : value - offset
    if (index < 0 || index >= length) continue
    if (offset > 0 && index < overlap) continue
    times.push((offset + index) / sampleRate)
  }
  return times
}

async function readKey(
  essentia: InstanceType<typeof Essentia>,
  channel: Float32Array,
  sampleRate: number,
): Promise<KeyEstimate | null> {
  const input = essentia.arrayToVector(channel)
  try {
    const result = essentia.KeyExtractor(
      input,
      true,
      4096,
      4096,
      12,
      3500,
      60,
      25,
      0.2,
      'bgate',
      sampleRate,
      0.0001,
      440,
      'cosine',
      'hann',
    )
    const scale = String(result.scale ?? '').toLowerCase()
    const strength = finite(result.strength, NaN)
    const name = String(result.key ?? '').trim()
    if (!name || (scale !== 'major' && scale !== 'minor') || !Number.isFinite(strength)) return null
    return { name, scale, strength }
  } catch {
    return null
  } finally {
    release(input)
    await sleep()
  }
}

function hearAt44100(channel: Float32Array, sampleRate: number): Float32Array {
  if (Math.abs(sampleRate - 44100) < 1) return channel
  const length = Math.max(1, Math.round((channel.length * 44100) / sampleRate))
  const rendered = new Float32Array(length)
  for (let index = 0; index < length; index++) {
    const position = (index * sampleRate) / 44100
    const cursor = Math.floor(position)
    const fraction = position - cursor
    const left = channel[cursor] ?? 0
    const right = channel[Math.min(channel.length - 1, cursor + 1)] ?? left
    rendered[index] = left + (right - left) * fraction
  }
  return rendered
}

async function readTempo(
  essentia: InstanceType<typeof Essentia>,
  channel: Float32Array,
  sampleRate: number,
): Promise<TempoEstimate | null> {
  const input = essentia.arrayToVector(hearAt44100(channel, sampleRate))
  try {
    const result = essentia.RhythmExtractor2013(input, 208, 'multifeature', 40)
    const estimates = asNumbers(essentia, result.estimates)
    release(result.ticks)
    release(result.bpmIntervals)
    const bpm = finite(result.bpm, NaN)
    const confidence = finite(result.confidence, NaN)
    if (!Number.isFinite(bpm) || bpm < 40 || !Number.isFinite(confidence)) return null
    return { bpm, confidence, alternate: alternateTempo(bpm, estimates) }
  } catch {
    return null
  } finally {
    release(input)
    await sleep()
  }
}

self.onmessage = (event: MessageEvent<InMessage>) => {
  const { left, right, sampleRate, mono } = event.data
  analyze(left, right, sampleRate, mono).then(
    (metrics) => post({ type: 'result', metrics }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : 'The mix could not be read.'
      post({ type: 'error', message })
    },
  )
}
