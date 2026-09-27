import { db } from './format'
import type { BandId, BandReading, Fault, Marker, Resonance, SpectrumPoint } from './types'

export const BARK_EDGES = [
  0, 50, 100, 150, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480, 1720, 2000, 2320, 2700,
  3150, 3700, 4400, 5300, 6400, 7700, 9500, 12000, 15500, 20500, 27000,
]

const BANDS: { id: BandId; label: string; target: number }[] = [
  { id: 'sub', label: 'Sub', target: -1.5 },
  { id: 'bass', label: 'Bass', target: 1 },
  { id: 'lowMid', label: 'Low mid', target: 0.5 },
  { id: 'mid', label: 'Mid', target: 0 },
  { id: 'presence', label: 'Presence', target: -0.5 },
  { id: 'air', label: 'Air', target: -1.5 },
]

export function samplePeak(channel: Float32Array): { linear: number; clipped: number } {
  let linear = 0
  let clipped = 0
  for (let i = 0; i < channel.length; i++) {
    const value = Math.abs(channel[i] ?? 0)
    if (value > linear) linear = value
    if (value >= 0.999) clipped += 1
  }
  return { linear, clipped }
}

/** 4× cubic peak, used when the ITU true-peak meter cannot return a level. */
export function hermiteTruePeak(channel: Float32Array): number {
  const n = channel.length
  if (n === 0) return 0
  let max = Math.abs(channel[0] ?? 0)
  if (n < 4) {
    for (let i = 1; i < n; i++) max = Math.max(max, Math.abs(channel[i] ?? 0))
    return max
  }
  for (let i = 1; i < n - 2; i++) {
    const y0 = channel[i - 1] ?? 0
    const y1 = channel[i] ?? 0
    const y2 = channel[i + 1] ?? 0
    const y3 = channel[i + 2] ?? 0
    max = Math.max(max, Math.abs(y1))
    const gate = Math.max(Math.abs(y1), Math.abs(y2))
    if (gate < max * 0.5 && gate < 0.25) continue
    for (const t of [0.25, 0.5, 0.75]) {
      max = Math.max(max, Math.abs(hermite(y0, y1, y2, y3, t)))
    }
  }
  return max
}

function hermite(y0: number, y1: number, y2: number, y3: number, t: number): number {
  const c0 = y1
  const c1 = 0.5 * (y2 - y0)
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
  return ((c3 * t + c2) * t + c1) * t + c0
}

export function waveformPeaks(mono: Float32Array, columns: number): number[] {
  const peaks = new Array<number>(columns).fill(0)
  if (mono.length === 0) return peaks
  const size = mono.length / columns
  let global = 0
  for (let i = 0; i < columns; i++) {
    const start = Math.floor(i * size)
    const end = Math.min(mono.length, Math.floor((i + 1) * size))
    let peak = 0
    for (let s = start; s < end; s++) peak = Math.max(peak, Math.abs(mono[s] ?? 0))
    peaks[i] = peak
    if (peak > global) global = peak
  }
  if (global > 0) {
    for (let i = 0; i < columns; i++) peaks[i] = (peaks[i] ?? 0) / global
  }
  return peaks
}

export function pearson(left: Float32Array, right: Float32Array, start: number, length: number): number | null {
  let sumL = 0
  let sumR = 0
  let sumLR = 0
  let sumL2 = 0
  let sumR2 = 0
  const end = Math.min(left.length, right.length, start + length)
  const n = end - start
  if (n < 8) return null
  for (let i = start; i < end; i++) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    sumL += l
    sumR += r
    sumLR += l * r
    sumL2 += l * l
    sumR2 += r * r
  }
  const denom = Math.sqrt((n * sumL2 - sumL * sumL) * (n * sumR2 - sumR * sumR))
  if (denom < 1e-8) return null
  return (n * sumLR - sumL * sumR) / denom
}

export function correlationCurve(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): { times: number[]; values: number[]; mean: number; min: number } {
  const frame = Math.max(8, Math.round(sampleRate * 0.4))
  const hop = Math.max(1, Math.round(sampleRate * 0.1))
  const times: number[] = []
  const values: number[] = []
  for (let start = 0; start + frame <= left.length; start += hop) {
    const value = pearson(left, right, start, frame)
    if (value === null) continue
    times.push(start / sampleRate)
    values.push(Math.max(-1, Math.min(1, value)))
  }
  if (values.length === 0) return { times, values, mean: 1, min: 1 }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const min = Math.min(...values)
  return { times, values, mean, min }
}

export function phaseDips(times: number[], values: number[]): Marker[] {
  const dips: Marker[] = []
  for (let i = 1; i < values.length - 1; i++) {
    const value = values[i] ?? 1
    const prev = values[i - 1] ?? value
    const next = values[i + 1] ?? value
    if (value > 0.2 || value > prev || value > next) continue
    const time = times[i] ?? 0
    if (dips.some((dip) => Math.abs(dip.time - time) < 6)) {
      const last = dips[dips.length - 1]
      if (last && value < last.value) {
        last.time = time
        last.value = value
      }
      continue
    }
    dips.push({ time, kind: 'phase', value })
  }
  return dips
    .sort((a, b) => a.value - b.value)
    .slice(0, 4)
    .sort((a, b) => a.time - b.time)
}

export function loudMoments(shortTerm: number[], hopSeconds: number): Marker[] {
  const values = shortTerm.map((value) => (Number.isFinite(value) ? value : -70))
  if (values.length < 5) return []
  const max = Math.max(...values)
  if (max < -50) return []
  const moments: Marker[] = []
  for (let i = 2; i < values.length - 2; i++) {
    const value = values[i] ?? -70
    if (value < max - 2.5) continue
    const neighborhood = values.slice(Math.max(0, i - 8), i + 9)
    const around = Math.max(...neighborhood.filter((_, index) => index !== Math.min(8, i)))
    if (value < around + 0.8) continue
    if (value < (values[i - 1] ?? -70) || value < (values[i + 1] ?? -70)) continue
    const time = i * hopSeconds
    if (moments.some((moment) => Math.abs(moment.time - time) < 8)) continue
    moments.push({ time, kind: 'peak', value })
  }
  return moments
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .sort((a, b) => a.time - b.time)
}

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number }

function lowpassCoeffs(sampleRate: number, frequency: number): Biquad {
  const q = Math.SQRT1_2
  const w0 = (2 * Math.PI * frequency) / sampleRate
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * q)
  const b0 = (1 - cos) / 2
  const b1 = 1 - cos
  const b2 = (1 - cos) / 2
  const a0 = 1 + alpha
  const a1 = -2 * cos
  const a2 = 1 - alpha
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

export function lowpass(channel: Float32Array, sampleRate: number, frequency: number): Float32Array {
  const { b0, b1, b2, a1, a2 } = lowpassCoeffs(sampleRate, frequency)
  const out = new Float32Array(channel.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < channel.length; i++) {
    const x0 = channel[i] ?? 0
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    out[i] = y0
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
  }
  return out
}

export function stereoEnergy(left: Float32Array, right: Float32Array): {
  width: number
  balance: number
} {
  let mid = 0
  let side = 0
  let leftEnergy = 0
  let rightEnergy = 0
  const n = Math.min(left.length, right.length)
  for (let i = 0; i < n; i++) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    const m = (l + r) * 0.5
    const s = (l - r) * 0.5
    mid += m * m
    side += s * s
    leftEnergy += l * l
    rightEnergy += r * r
  }
  const total = mid + side
  const sides = leftEnergy + rightEnergy
  return {
    width: total > 0 ? side / total : 0,
    balance: sides > 0 ? (rightEnergy - leftEnergy) / sides : 0,
  }
}

export function monoMix(left: Float32Array, right: Float32Array): Float32Array {
  const n = Math.min(left.length, right.length)
  const mono = new Float32Array(n)
  for (let i = 0; i < n; i++) mono[i] = ((left[i] ?? 0) + (right[i] ?? 0)) * 0.5
  return mono
}

function bandCenter(lo: number, hi: number): number {
  const start = Math.max(lo, 20)
  const end = Math.max(hi, start + 1)
  return Math.sqrt(start * end)
}

function bandFor(hz: number): BandId {
  if (hz < 60) return 'sub'
  if (hz < 250) return 'bass'
  if (hz < 500) return 'lowMid'
  if (hz < 2000) return 'mid'
  if (hz < 6000) return 'presence'
  return 'air'
}

/** Positive deviation means that band is louder than a balanced tilt. */
export function bandsFromBark(energies: ArrayLike<number>, sampleRate: number): BandReading[] {
  const nyquist = sampleRate / 2
  const grouped = new Map<BandId, { power: number; width: number; centerNum: number }>()
  for (const band of BANDS) grouped.set(band.id, { power: 0, width: 0, centerNum: 0 })

  const count = Math.min(energies.length, BARK_EDGES.length - 1)
  for (let i = 0; i < count; i++) {
    const lo = BARK_EDGES[i] ?? 0
    const hi = Math.min(BARK_EDGES[i + 1] ?? nyquist, nyquist)
    if (hi <= lo || hi < 20) continue
    const center = bandCenter(lo, hi)
    const bucket = grouped.get(bandFor(center))
    if (!bucket) continue
    const power = Math.max(0, energies[i] ?? 0)
    const width = hi - lo
    bucket.power += power
    bucket.width += width
    bucket.centerNum += center * width
  }

  const measured = BANDS.map((band) => {
    const bucket = grouped.get(band.id)!
    const center = bucket.width > 0 ? bucket.centerNum / bucket.width : 1000
    const density = bucket.width > 0 ? bucket.power / bucket.width : 0
    const densityDb = 10 * Math.log10(density + 1e-12)
    const pink = -3 * Math.log2(center / 1000)
    return { band, densityDb, pink }
  })

  // Empty bands would otherwise sit near -120 dB and invent a huge deviation.
  const peak = Math.max(...measured.map((entry) => entry.densityDb))
  const floor = peak - 30
  const raw = measured.map((entry) => Math.max(entry.densityDb, floor) - entry.pink - entry.band.target)
  const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length
  return measured.map((entry, index) => ({
    id: entry.band.id,
    label: entry.band.label,
    deviationDb: clamp((raw[index] ?? 0) - mean, -12, 12),
  }))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function resonancesFromSpectrum(power: Float64Array, sampleRate: number): Resonance[] {
  const n = power.length
  if (n < 16) return []
  const binHz = sampleRate / (2 * (n - 1))
  const dbValues = new Float64Array(n)
  for (let i = 0; i < n; i++) dbValues[i] = 10 * Math.log10((power[i] ?? 0) + 1e-12)

  const found: Resonance[] = []
  for (let i = 2; i < n - 2; i++) {
    const hz = i * binHz
    if (hz < 100 || hz > 12000) continue
    const level = dbValues[i] ?? -120
    if (level < (dbValues[i - 1] ?? -120) || level < (dbValues[i + 1] ?? -120)) continue
    const lo = hz / 1.5
    const hi = hz * 1.5
    const window: number[] = []
    for (let j = 1; j < n - 1; j++) {
      const freq = j * binHz
      if (freq >= lo && freq <= hi) window.push(dbValues[j] ?? -120)
    }
    if (window.length < 5) continue
    window.sort((a, b) => a - b)
    const median = window[Math.floor(window.length / 2)] ?? level
    const prominence = level - median
    if (prominence < 6) continue
    const last = found[found.length - 1]
    if (last && hz / last.hz < 1.26) {
      if (prominence > last.prominenceDb) {
        last.hz = hz
        last.prominenceDb = prominence
      }
      continue
    }
    found.push({ hz, prominenceDb: prominence })
  }

  return found
    .sort((a, b) => b.prominenceDb - a.prominenceDb)
    .slice(0, 2)
    .sort((a, b) => a.hz - b.hz)
}

export function spectralCentroid(power: Float64Array, sampleRate: number): number {
  const n = power.length
  if (n < 2) return 0
  const binHz = sampleRate / (2 * (n - 1))
  let num = 0
  let den = 0
  for (let i = 1; i < n; i++) {
    const mag = Math.sqrt(Math.max(0, power[i] ?? 0))
    num += i * binHz * mag
    den += mag
  }
  return den > 0 ? num / den : 0
}

export function toDbtp(linear: number): number {
  return db(linear)
}

export const SPECTRUM_MIN_HZ = 20
export const SPECTRUM_MAX_HZ = 20000
export const SPECTRUM_FLOOR_DB = -48

export const BAND_RANGES: { id: BandId; from: number; to: number }[] = [
  { id: 'sub', from: 20, to: 60 },
  { id: 'bass', from: 60, to: 250 },
  { id: 'lowMid', from: 250, to: 500 },
  { id: 'mid', from: 500, to: 2000 },
  { id: 'presence', from: 2000, to: 6000 },
  { id: 'air', from: 6000, to: 20000 },
]

/** Whole-mix average, peak-normalized, on a log frequency grid. */
export function logSpectrum(power: Float64Array, sampleRate: number, points = 168): SpectrumPoint[] {
  const nyquist = sampleRate / 2
  const maxHz = Math.min(nyquist * 0.98, SPECTRUM_MAX_HZ)
  const minHz = SPECTRUM_MIN_HZ
  if (power.length < 8 || maxHz <= minHz) return []
  const binHz = sampleRate / (2 * (power.length - 1))
  const measured: SpectrumPoint[] = []
  let peak = -120
  for (let i = 0; i < points; i++) {
    const start = minHz * (maxHz / minHz) ** (i / points)
    const end = minHz * (maxHz / minHz) ** ((i + 1) / points)
    const i0 = Math.max(1, Math.floor(start / binHz))
    const i1 = Math.min(power.length - 1, Math.max(i0, Math.ceil(end / binHz)))
    let sum = 0
    let count = 0
    for (let bin = i0; bin <= i1; bin++) {
      sum += power[bin] ?? 0
      count += 1
    }
    const level = 10 * Math.log10((count > 0 ? sum / count : 0) + 1e-12)
    if (level > peak) peak = level
    measured.push({ hz: Math.sqrt(start * end), db: level })
  }
  return measured.map((point) => ({
    hz: point.hz,
    db: clamp(point.db - peak, SPECTRUM_FLOOR_DB, 0),
  }))
}

/** Map an analyser FFT, in dB, onto the same log grid as the average spectrum. */
export function sampleLiveSpectrum(bins: ArrayLike<number>, sampleRate: number, fftSize: number, targets: number[]): number[] {
  if (bins.length < 2 || targets.length === 0) return []
  const binHz = sampleRate / fftSize
  const values = targets.map((hz) => {
    const index = hz / binHz
    const i0 = Math.max(0, Math.min(bins.length - 1, Math.floor(index)))
    const i1 = Math.min(bins.length - 1, i0 + 1)
    const frac = index - i0
    const left = bins[i0] ?? -120
    const right = bins[i1] ?? left
    return left + (right - left) * frac
  })
  const peak = Math.max(...values.filter((value) => Number.isFinite(value)))
  if (!Number.isFinite(peak) || peak < -85) return []
  return values.map((value) => clamp((Number.isFinite(value) ? value : -120) - peak, SPECTRUM_FLOOR_DB, 0))
}

export function downsample(values: number[], points = 240): number[] {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return []
  if (finite.length <= points) return finite
  const out: number[] = []
  for (let index = 0; index < points; index++) {
    const start = Math.floor((index * finite.length) / points)
    const end = Math.max(start + 1, Math.floor(((index + 1) * finite.length) / points))
    let sum = 0
    let count = 0
    for (let cursor = start; cursor < end; cursor++) {
      const value = finite[cursor]
      if (value === undefined) continue
      sum += value
      count += 1
    }
    if (count > 0) out.push(sum / count)
  }
  return out
}

export function edgeSilence(channel: Float32Array, sampleRate: number, thresholdDb = -50): { start: number; end: number } {
  const frame = Math.max(1, Math.round(sampleRate * 0.05))
  const threshold = 10 ** (thresholdDb / 20)
  const loud = (start: number) => {
    let sum = 0
    const end = Math.min(channel.length, start + frame)
    for (let index = start; index < end; index++) sum += (channel[index] ?? 0) ** 2
    return Math.sqrt(sum / Math.max(1, end - start)) >= threshold
  }
  let lead = 0
  while (lead + frame <= channel.length && !loud(lead)) lead += frame
  let tail = channel.length
  while (tail - frame >= 0 && !loud(tail - frame)) tail -= frame
  return {
    start: lead / sampleRate,
    end: Math.max(0, (channel.length - tail) / sampleRate),
  }
}

export function silenceFaults(start: number, end: number, duration: number): Fault[] {
  const faults: Fault[] = []
  if (start >= 2 && start < duration - 0.2) faults.push({ kind: 'silence', time: 0, seconds: start, edge: 'start' })
  if (end >= 3 && end < duration - 0.2) faults.push({ kind: 'silence', time: Math.max(0, duration - end), seconds: end, edge: 'end' })
  return faults
}

/** A hole in the middle: silence bracketed by signal, between 15 ms and 3.5 s. */
export function signalGaps(channel: Float32Array, sampleRate: number): { time: number; seconds: number }[] {
  const frame = Math.max(1, Math.round(sampleRate * 0.02))
  const silence = 10 ** (-50 / 20)
  const present = 10 ** (-30 / 20)
  const rms: number[] = []
  for (let start = 0; start + frame <= channel.length; start += frame) {
    let sum = 0
    for (let index = start; index < start + frame; index++) sum += (channel[index] ?? 0) ** 2
    rms.push(Math.sqrt(sum / frame))
  }
  const gaps: { time: number; seconds: number }[] = []
  let run = 0
  const close = (end: number) => {
    if (run < 1) return
    const seconds = (run * frame) / sampleRate
    const start = end - run
    const before = rms.slice(Math.max(0, start - 2), start)
    const after = rms[end] ?? 0
    if (seconds >= 0.015 && seconds <= 3.5 && before.length >= 2 && before.every((value) => value >= present) && after >= present) {
      gaps.push({ time: (start * frame) / sampleRate, seconds })
    }
  }
  for (let index = 0; index < rms.length; index++) {
    if ((rms[index] ?? 1) < silence) {
      run += 1
      continue
    }
    close(index)
    run = 0
  }
  return gaps
}

export function clusterTimes(times: number[], separation = 0.04): number[] {
  const sorted = times.filter((time) => Number.isFinite(time) && time >= 0).sort((a, b) => a - b)
  const clustered: number[] = []
  for (const time of sorted) {
    const last = clustered[clustered.length - 1]
    if (last !== undefined && time - last < separation) continue
    clustered.push(time)
  }
  return clustered
}

/** Keep a handful of events. A drum hit on every beat is not a fault. */
export function sparseTimes(times: number[], max: number, separation = 0.04): number[] {
  const clustered = clusterTimes(times, separation)
  if (clustered.length === 0 || clustered.length > max) return []
  return clustered
}

export function alternateTempo(bpm: number, estimates: number[]): number | null {
  if (!Number.isFinite(bpm) || bpm <= 0) return null
  const distinct = estimates.filter((estimate) => Number.isFinite(estimate) && estimate > 0 && Math.abs(estimate - bpm) / bpm > 0.08)
  const related = distinct.find(
    (estimate) => Math.abs(estimate * 2 - bpm) / bpm < 0.08 || Math.abs(estimate / 2 - bpm) / bpm < 0.08,
  )
  const chosen = related ?? distinct[0]
  return chosen === undefined ? null : Math.round(chosen)
}
