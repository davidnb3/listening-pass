import { describe, expect, it } from 'vitest'
import { alternateTempo, bandsFromBark, correlationCurve, downsample, edgeSilence, hermiteTruePeak, logSpectrum, pearson, resonancesFromSpectrum, sampleLiveSpectrum, samplePeak, signalGaps, silenceFaults, sparseTimes } from './dsp'

describe('stereo and peaks', () => {
  it('hears identical channels as fully correlated', () => {
    const left = new Float32Array(4000)
    const right = new Float32Array(4000)
    for (let i = 0; i < left.length; i++) {
      const value = Math.sin(i / 12)
      left[i] = value
      right[i] = value
    }
    const curve = correlationCurve(left, right, 4000)
    expect(curve.mean).toBeGreaterThan(0.99)
  })

  it('hears inverted channels as out of phase', () => {
    const left = new Float32Array(2000)
    const right = new Float32Array(2000)
    for (let i = 0; i < left.length; i++) {
      left[i] = Math.sin(i / 8) * 0.5
      right[i] = -(left[i] ?? 0)
    }
    const value = pearson(left, right, 0, left.length)
    expect(value).not.toBeNull()
    expect(value!).toBeLessThan(-0.99)
  })

  it('counts full-scale samples and keeps a sine under the ceiling', () => {
    const tone = new Float32Array(1000)
    for (let i = 0; i < tone.length; i++) tone[i] = Math.sin((i / 48) * Math.PI * 2) * 0.5
    tone[10] = 1
    tone[11] = -1
    const peak = samplePeak(tone)
    expect(peak.clipped).toBe(2)
    const clean = new Float32Array(1000)
    for (let i = 0; i < clean.length; i++) clean[i] = Math.sin((i / 48) * Math.PI * 2) * 0.5
    expect(hermiteTruePeak(clean)).toBeGreaterThan(0.49)
    expect(hermiteTruePeak(clean)).toBeLessThan(0.62)
  })
})

describe('spectrum shape', () => {
  it('flags a narrow spike above the surrounding tilt', () => {
    const power = new Float64Array(512)
    for (let i = 1; i < power.length; i++) power[i] = 1 / i
    power[80] = (power[80] ?? 0) * 80
    const peaks = resonancesFromSpectrum(power, 44100)
    expect(peaks.length).toBeGreaterThan(0)
    expect(peaks[0]?.hz).toBeGreaterThan(1000)
    expect(peaks[0]?.hz).toBeLessThan(9000)
  })

  it('hears extra bass as a positive deviation', () => {
    const edges = 27
    const flat = new Array<number>(edges).fill(1)
    const bassHeavy = flat.map((value, index) => (index < 4 ? value * 12 : value))
    const flatBands = bandsFromBark(flat, 44100)
    const heavyBands = bandsFromBark(bassHeavy, 44100)
    const flatBass = flatBands.find((band) => band.id === 'bass')?.deviationDb ?? 0
    const heavyBass = heavyBands.find((band) => band.id === 'bass')?.deviationDb ?? 0
    expect(heavyBass).toBeGreaterThan(flatBass + 2)
  })

  it('does not turn a single loud band into an absurd deviation', () => {
    const energies = new Array<number>(27).fill(0.0001)
    energies[4] = 20
    const bands = bandsFromBark(energies, 44100)
    for (const band of bands) {
      expect(Math.abs(band.deviationDb)).toBeLessThanOrEqual(12)
    }
    const bass = bands.find((band) => band.id === 'bass')
    expect(bass?.deviationDb).toBeGreaterThan(4)
  })

  it('keeps the average spectrum on a log grid, peaked at 0 dB', () => {
    const power = new Float64Array(2049)
    for (let i = 1; i < power.length; i++) power[i] = 1 / i
    const bin = Math.round(440 / (44100 / 4096))
    power[bin] = 40
    const spectrum = logSpectrum(power, 44100)
    expect(spectrum.length).toBeGreaterThan(40)
    expect(Math.max(...spectrum.map((point) => point.db))).toBe(0)
    const loudest = spectrum.reduce((best, point) => (point.db > best.db ? point : best))
    expect(loudest.hz).toBeGreaterThan(300)
    expect(loudest.hz).toBeLessThan(700)
    const live = sampleLiveSpectrum([-10, -40, -80, -20], 400, 8, [50, 150])
    expect(live[1]).toBe(0)
    expect(live[0]).toBeLessThan(0)
  })
})

describe('contours, silence, and tempo', () => {
  it('downsamples a contour without dropping the ends of the range', () => {
    const values = Array.from({ length: 1000 }, (_, index) => index)
    const contour = downsample(values, 10)
    expect(contour).toHaveLength(10)
    expect(contour[0]).toBeLessThan(100)
    expect(contour[9]).toBeGreaterThan(900)
  })

  it('measures silence only at the ends, and a hole only in the middle', () => {
    const sampleRate = 1000
    const channel = new Float32Array(sampleRate * 3)
    for (let index = sampleRate; index < sampleRate * 2; index++) channel[index] = 0.2
    const edges = edgeSilence(channel, sampleRate)
    expect(edges.start).toBeGreaterThan(0.8)
    expect(edges.end).toBeGreaterThan(0.8)
    expect(silenceFaults(2.4, 0.2, 180)).toEqual([{ kind: 'silence', time: 0, seconds: 2.4, edge: 'start' }])
    expect(signalGaps(channel, sampleRate)).toHaveLength(0)

    const holed = new Float32Array(sampleRate)
    for (let index = 0; index < holed.length; index++) holed[index] = 0.25
    holed.fill(0, 400, 500)
    const gaps = signalGaps(holed, sampleRate)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.seconds).toBeGreaterThan(0.05)
    expect(gaps[0]?.seconds).toBeLessThan(0.2)
  })

  it('names the half-time tempo and ignores a crowded set of clicks', () => {
    expect(alternateTempo(120, [120, 60, 90])).toBe(60)
    expect(alternateTempo(100, [100, 103])).toBeNull()
    expect(sparseTimes([1, 1.01, 8], 6)).toEqual([1, 8])
    expect(sparseTimes(Array.from({ length: 10 }, (_, index) => index), 6)).toEqual([])
  })
})
