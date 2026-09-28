import { describe, expect, it } from 'vitest'
import { buildReport, visibleFigures } from './rules'
import type { Metrics } from './types'

function metrics(patch: Partial<Metrics> = {}): Metrics {
  return {
    duration: 180,
    sampleRate: 44100,
    mono: false,
    integratedLufs: -14,
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

describe('buildReport', () => {
  it('describes a balanced mix without scolding it', () => {
    const report = buildReport(metrics())
    expect(report.opening).toMatch(/comfortably/i)
    expect(report.chapters).toHaveLength(3)
    expect(report.chapters.every((chapter) => chapter.findings.some((item) => item.severity === 'good'))).toBe(true)
    expect(report.chapters.flatMap((chapter) => chapter.findings).some((item) => item.severity === 'fix')).toBe(false)
  })

  it('does not call a clean master distorted when true peak is near +1', () => {
    const report = buildReport(metrics({ truePeakDbtp: 1, samplePeakDbfs: -0.1, clippedSamples: 0 }))
    expect(report.opening).not.toMatch(/distort/i)
    const ceiling = report.chapters[0]?.findings.find((item) => item.id === 'ceiling')
    expect(ceiling?.severity).toBe('watch')
    expect(ceiling?.title).not.toMatch(/distort/i)
    expect(ceiling?.explanation).toMatch(/does not sound distorted/)
    expect(ceiling?.tip).toMatch(/sounds clean, leave it/)
  })

  it('treats clipping as something to fix', () => {
    const report = buildReport(metrics({ clippedSamples: 40, truePeakDbtp: 0.4 }))
    expect(report.opening).toMatch(/clipping/i)
    const ceiling = report.chapters[0]?.findings.find((item) => item.id === 'ceiling')
    expect(ceiling?.severity).toBe('fix')
    expect(ceiling?.tip.length).toBeGreaterThan(20)
  })

  it('names a low-mid buildup', () => {
    const report = buildReport(
      metrics({
        bands: metrics().bands.map((band) =>
          band.id === 'lowMid' ? { ...band, deviationDb: 7.5 } : band,
        ),
      }),
    )
    expect(report.opening).toMatch(/low mids/i)
    const note = report.chapters[1]?.findings.find((item) => item.id === 'band-lowMid')
    expect(note?.severity).toBe('fix')
    expect(note?.explanation).toMatch(/muddy/)
    expect(note?.tip).toMatch(/200/)
  })

  it('warns when the bass is wide and the sides disagree', () => {
    const report = buildReport(metrics({ correlation: 0.05, lowEndWidth: 0.3, width: 0.4 }))
    expect(report.opening).toMatch(/phase|mono/i)
    expect(report.chapters[2]?.findings.find((item) => item.id === 'low-end')?.severity).toBe('fix')
  })

  it('keeps a weak key and tempo out of the figures', () => {
    const quiet = buildReport(
      metrics({
        key: { name: 'F', scale: 'minor', strength: 0.4 },
        tempo: { bpm: 96, confidence: 1.2, alternate: 192 },
      }),
    )
    expect(quiet.figures.map((figure) => figure.label)).toEqual([
      'Integrated',
      'Range',
      'Peak',
      'True peak',
      'Correlation',
    ])
    expect(quiet.figures.find((figure) => figure.label === 'Peak')).toMatchObject({ value: '-1.8', unit: 'dBFS' })
    const older = { ...quiet, figures: quiet.figures.filter((figure) => figure.label !== 'Peak') }
    expect(visibleFigures(older).map((figure) => figure.label)).toEqual([
      'Integrated',
      'Range',
      'Peak',
      'True peak',
      'Correlation',
    ])
    const strong = buildReport(
      metrics({
        key: { name: 'D', scale: 'minor', strength: 0.82 },
        tempo: { bpm: 96.4, confidence: 3.4, alternate: 192 },
      }),
    )
    expect(strong.figures.find((figure) => figure.label === 'Key')).toMatchObject({ value: 'D', unit: 'minor' })
    expect(strong.figures.find((figure) => figure.label === 'Tempo')).toMatchObject({ value: '96', unit: 'BPM · 192' })
    expect(strong.chapters.flatMap((chapter) => chapter.findings).some((item) => /key|tempo/i.test(item.title))).toBe(false)
  })

  it('mentions a few clicks and stays quiet when they are everywhere', () => {
    const few = buildReport(
      metrics({
        faults: [
          { kind: 'click', time: 12, seconds: 0 },
          { kind: 'click', time: 40, seconds: 0 },
        ],
      }),
    )
    expect(few.chapters[0]?.findings.find((item) => item.id === 'clicks')?.severity).toBe('watch')
    const many = buildReport(
      metrics({
        faults: Array.from({ length: 12 }, (_, index) => ({ kind: 'click' as const, time: index, seconds: 0 })),
      }),
    )
    expect(many.chapters[0]?.findings.some((item) => item.id === 'clicks')).toBe(false)
  })

  it('notes silence at the ends of the file', () => {
    const report = buildReport(
      metrics({
        faults: [
          { kind: 'silence', time: 0, seconds: 2.4, edge: 'start' },
          { kind: 'silence', time: 170, seconds: 4.2, edge: 'end' },
        ],
      }),
    )
    const notes = report.chapters[0]?.findings ?? []
    expect(notes.find((item) => item.id === 'silence-start')?.explanation).toMatch(/2\.4/)
    expect(notes.find((item) => item.id === 'silence-end')?.explanation).toMatch(/4\.2/)
  })

  it('treats −8 LUFS as a finished master and −14 as quieter than that', () => {
    const finished = buildReport(metrics({ integratedLufs: -8, loudnessRange: 5, crestDb: 7 }))
    const loudness = finished.chapters[0]?.findings.find((item) => item.id === 'loudness')
    expect(loudness?.severity).toBe('good')
    expect(loudness?.title).toBe('Loudness is in a finished-master range')
    expect(loudness?.explanation).toMatch(/−9 and −7/)
    expect(`${loudness?.title} ${loudness?.explanation}`).not.toMatch(/too loud|very loud|streaming target/i)

    const playback = buildReport(metrics({ integratedLufs: -14, loudnessRange: 8, crestDb: 12 }))
    const quiet = playback.chapters[0]?.findings.find((item) => item.id === 'loudness')
    expect(quiet?.title).toMatch(/quieter than a finished-master range/i)
    expect(quiet?.explanation).not.toMatch(/leave a master alone|too loud/i)
  })

  it('does not call a heavy sub mud on a laptop', () => {
    const report = buildReport(
      metrics({
        bands: [
          { id: 'sub', label: 'Sub', deviationDb: 12 },
          { id: 'bass', label: 'Bass', deviationDb: 1 },
          { id: 'lowMid', label: 'Low mid', deviationDb: 0.2 },
          { id: 'mid', label: 'Mid', deviationDb: 0 },
          { id: 'presence', label: 'Presence', deviationDb: 0 },
          { id: 'air', label: 'Air', deviationDb: 0 },
        ],
      }),
    )
    const sub = report.chapters[1]?.findings.find((item) => item.id === 'band-sub')
    expect(sub?.severity).toBe('watch')
    expect(`${sub?.explanation} ${sub?.tip}`).not.toMatch(/mud|wasted headroom/i)
    expect(sub?.explanation).toMatch(/missing there\.$/)
    expect(sub?.tip).toMatch(/80 Hz/)
  })

  it('says a one-channel file is mono', () => {
    const report = buildReport(metrics({ mono: true, correlation: 1, width: 0, lowEndWidth: 0 }))
    expect(report.chapters[2]?.findings.find((item) => item.id === 'image')?.title).toMatch(/mono/i)
  })
})
