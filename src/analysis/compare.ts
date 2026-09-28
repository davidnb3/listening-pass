import type { Metrics } from './types'

export type BandDelta = {
  id: Metrics['bands'][number]['id']
  label: string
  deltaDb: number
}

export type Comparison = {
  name: string
  integratedLu: number
  rangeLu: number
  truePeakDb: number
  samplePeakDb: number
  correlation: number
  bands: BandDelta[]
}

export type DeltaValue = {
  value: number
  digits: number
}

/** Keyed by the label already printed next to a number. */
export type DeltaMap = Record<string, DeltaValue>

/** Sign +1 is this pass minus the other. Sign −1 is the reverse, for the other column. */
export function deltaMap(comparison: Comparison, sign: 1 | -1): DeltaMap {
  const map: DeltaMap = {
    Integrated: { value: sign * comparison.integratedLu, digits: 1 },
    Range: { value: sign * comparison.rangeLu, digits: 1 },
    'Loudness range': { value: sign * comparison.rangeLu, digits: 1 },
    Peak: { value: sign * comparison.samplePeakDb, digits: 1 },
    'True peak': { value: sign * comparison.truePeakDb, digits: 1 },
    Correlation: { value: sign * comparison.correlation, digits: 2 },
  }
  for (const band of comparison.bands) {
    map[band.label] = { value: sign * band.deltaDb, digits: 1 }
  }
  return map
}

/** This pass minus the other file. Positive means this pass is higher. */
export function compareMetrics(current: Metrics, other: Metrics, name: string): Comparison {
  return {
    name,
    integratedLu: current.integratedLufs - other.integratedLufs,
    rangeLu: current.loudnessRange - other.loudnessRange,
    truePeakDb: current.truePeakDbtp - other.truePeakDbtp,
    samplePeakDb: current.samplePeakDbfs - other.samplePeakDbfs,
    correlation: current.correlation - other.correlation,
    bands: current.bands.map((band) => {
      const match = other.bands.find((item) => item.id === band.id)
      return { id: band.id, label: band.label, deltaDb: band.deviationDb - (match?.deviationDb ?? 0) }
    }),
  }
}
