import { describe, expect, it } from 'vitest'
import { compareMetrics, deltaMap } from './compare'
import { buildReport } from './rules'
import type { Metrics } from './types'

function metrics(patch: Partial<Metrics>): Metrics {
  const report = buildReport({
    duration: 30,
    sampleRate: 44100,
    mono: false,
    integratedLufs: -14,
    loudnessRange: 6,
    dynamicComplexity: 3,
    truePeakDbtp: -1.2,
    samplePeakDbfs: -1.5,
    clippedSamples: 0,
    crestDb: 12,
    centroidHz: 1800,
    dissonance: 0.05,
    bands: [
      { id: 'sub', label: 'Sub', deviationDb: 0 },
      { id: 'bass', label: 'Bass', deviationDb: 1 },
      { id: 'lowMid', label: 'Low mid', deviationDb: 0 },
      { id: 'mid', label: 'Mid', deviationDb: 0 },
      { id: 'presence', label: 'Presence', deviationDb: 0 },
      { id: 'air', label: 'Air', deviationDb: -1 },
    ],
    resonances: [],
    spectrum: [],
    correlation: 0.8,
    width: 0.1,
    lowEndWidth: 0.02,
    balance: 0,
    markers: [],
    waveform: [0.2, 0.4],
    loudness: [-14, -12],
    correlationOverTime: [0.8, 0.8],
    faults: [],
    key: null,
    tempo: null,
    ...patch,
  })
  return report.metrics
}

describe('compareMetrics', () => {
  it('subtracts the other file from this pass', () => {
    const current = metrics({ integratedLufs: -12, loudnessRange: 5, truePeakDbtp: -0.8 })
    const other = metrics({
      integratedLufs: -14,
      loudnessRange: 7,
      truePeakDbtp: -1.4,
      bands: metrics({}).bands.map((band) => (band.id === 'bass' ? { ...band, deviationDb: -1 } : band)),
    })
    const comparison = compareMetrics(current, other, 'earlier.wav')
    expect(comparison.name).toBe('earlier.wav')
    expect(comparison.integratedLu).toBeCloseTo(2)
    expect(comparison.rangeLu).toBeCloseTo(-2)
    expect(comparison.truePeakDb).toBeCloseTo(0.6)
    expect(comparison.correlation).toBeCloseTo(0)
    expect(comparison.bands.find((band) => band.id === 'bass')?.deltaDb).toBeCloseTo(2)
    expect(deltaMap(comparison, 1).Integrated.value).toBeCloseTo(2)
    expect(deltaMap(comparison, -1).Bass.value).toBeCloseTo(-2)
    expect(deltaMap(comparison, 1)['Loudness range'].value).toBeCloseTo(-2)
  })
})
