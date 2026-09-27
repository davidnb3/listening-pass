export type BandId = 'sub' | 'bass' | 'lowMid' | 'mid' | 'presence' | 'air'

export type BandReading = {
  id: BandId
  label: string
  deviationDb: number
}

export type Marker = {
  time: number
  kind: 'peak' | 'phase'
  value: number
}

export type Resonance = {
  hz: number
  prominenceDb: number
}

export type SpectrumPoint = {
  hz: number
  db: number
}

export type FaultKind = 'click' | 'dropout' | 'gap' | 'burst' | 'silence'

export type Fault = {
  kind: FaultKind
  time: number
  seconds: number
  edge?: 'start' | 'end'
}

export type KeyEstimate = {
  name: string
  scale: 'major' | 'minor'
  strength: number
}

export type TempoEstimate = {
  bpm: number
  confidence: number
  alternate: number | null
}

export type Metrics = {
  duration: number
  sampleRate: number
  mono: boolean
  integratedLufs: number
  loudnessRange: number
  dynamicComplexity: number | null
  truePeakDbtp: number
  samplePeakDbfs: number
  clippedSamples: number
  crestDb: number
  centroidHz: number
  dissonance: number | null
  bands: BandReading[]
  resonances: Resonance[]
  spectrum: SpectrumPoint[]
  correlation: number
  width: number
  lowEndWidth: number
  balance: number
  markers: Marker[]
  waveform: number[]
  loudness: number[]
  correlationOverTime: number[]
  faults: Fault[]
  key: KeyEstimate | null
  tempo: TempoEstimate | null
}

export type GroupId = 'dynamics' | 'frequency' | 'space'

export type Severity = 'good' | 'watch' | 'fix'

export type Finding = {
  id: string
  group: GroupId
  severity: Severity
  title: string
  explanation: string
  tip: string
  evidence: { label: string; value: string }[]
}

export type Chapter = {
  id: GroupId
  label: string
  verdict: string
  findings: Finding[]
}

export type Figure = {
  label: string
  value: string
  unit: string
}

export type Report = {
  opening: string
  figures: Figure[]
  chapters: Chapter[]
  metrics: Metrics
}
