import { describe, expect, it } from 'vitest'
import { fourFigures, remember, type PassRecord } from './history'

function pass(id: string): PassRecord {
  return {
    id,
    name: `${id}.wav`,
    at: 1,
    report: {
      opening: '',
      figures: [
        { label: 'Integrated', value: '-14.0', unit: 'LUFS' },
        { label: 'Range', value: '+6.0', unit: 'LU' },
        { label: 'True peak', value: '-1.2', unit: 'dBTP' },
        { label: 'Correlation', value: '+0.80', unit: '' },
        { label: 'Key', value: 'D', unit: 'minor' },
      ],
      chapters: [],
      metrics: {
        duration: 1,
        sampleRate: 44100,
        mono: false,
        integratedLufs: -14,
        loudnessRange: 6,
        dynamicComplexity: null,
        truePeakDbtp: -1,
        samplePeakDbfs: -1,
        clippedSamples: 0,
        crestDb: 12,
        centroidHz: 1000,
        dissonance: null,
        bands: [],
        resonances: [],
        spectrum: [],
        correlation: 0.8,
        width: 0,
        lowEndWidth: 0,
        balance: 0,
        markers: [],
        waveform: [],
        loudness: [],
        correlationOverTime: [],
        faults: [],
        key: null,
        tempo: null,
      },
    },
  }
}

describe('history', () => {
  it('keeps the four mix figures and the newest passes', () => {
    expect(fourFigures(pass('a').report.figures).map((figure) => figure.label)).toEqual([
      'Integrated',
      'Range',
      'True peak',
      'Correlation',
    ])
    const saved = remember([pass('old')], pass('new'), 1)
    expect(saved.map((item) => item.id)).toEqual(['new'])
  })
})