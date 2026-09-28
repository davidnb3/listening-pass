import { describe, expect, it } from 'vitest'
import { buildReport } from './rules'
import { standouts } from './standouts'
import type { Metrics } from './types'

function metrics(patch: Partial<Metrics> = {}): Metrics {
  return {
    duration: 180,
    sampleRate: 44100,
    mono: false,
    integratedLufs: -8,
    loudnessRange: 8,
    dynamicComplexity: 4,
    truePeakDbtp: -1.4,
    samplePeakDbfs: -1.8,
    clippedSamples: 0,
    crestDb: 12.6,
    centroidHz: 2100,
    dissonance: 0.04,
    bands: [
      { id: 'sub', label: 'Sub', deviationDb: 0.2 },
      { id: 'bass', label: 'Bass', deviationDb: 0.4 },
      { id: 'lowMid', label: 'Low mid', deviationDb: -0.3 },
      { id: 'mid', label: 'Mid', deviationDb: 0.1 },
      { id: 'presence', label: 'Presence', deviationDb: -0.2 },
      { id: 'air', label: 'Air', deviationDb: -0.2 },
    ],
    resonances: [],
    spectrum: [],
    correlation: 0.72,
    width: 0.12,
    lowEndWidth: 0.03,
    balance: 0.02,
    markers: [],
    waveform: [0.2, 0.8, 0.4],
    loudness: [-18, -14, -16],
    correlationOverTime: [0.7, 0.8, 0.6],
    faults: [],
    key: null,
    tempo: null,
    ...patch,
  }
}

describe('standouts', () => {
  it('keeps a calm mix to a single note', () => {
    const items = standouts(buildReport(metrics()))
    expect(items).toHaveLength(1)
    expect(items[0]?.kind).toBe('note')
    expect(items[0]?.title).toMatch(/comfortably/i)
  })

  it('mixes an irregularity, a critique, and a recommendation', () => {
    const items = standouts(
      buildReport(
        metrics({
          clippedSamples: 12,
          truePeakDbtp: 0.8,
          integratedLufs: -14,
          bands: metrics().bands.map((band) => (band.id === 'lowMid' ? { ...band, deviationDb: 7.5 } : band)),
          faults: [{ kind: 'click', time: 4, seconds: 0 }],
        }),
      ),
    )
    expect(items.map((item) => item.kind)).toEqual(['irregularity', 'critique', 'recommendation', 'irregularity'])
    expect(items.some((item) => /clipping/i.test(item.title))).toBe(true)
    expect(items.some((item) => /low mids/i.test(item.title))).toBe(true)
    expect(items.some((item) => item.kind === 'recommendation' && /leave the level alone/i.test(item.detail))).toBe(true)
    expect(items.some((item) => /distort on playback/i.test(`${item.title} ${item.detail}`))).toBe(false)
  })

  it('adds key and tempo when they are shown in the figures', () => {
    const items = standouts(
      buildReport(
        metrics({
          key: { name: 'D', scale: 'minor', strength: 0.82 },
          tempo: { bpm: 96.4, confidence: 3.4, alternate: 192 },
        }),
      ),
    )
    expect(items.find((item) => item.id === 'key')?.title).toMatch(/D minor/)
    expect(items.find((item) => item.id === 'tempo')?.detail).toMatch(/192/)
  })
})
