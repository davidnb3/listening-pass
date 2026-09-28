import type { Finding, Report } from './types'

export type StandoutKind = 'recommendation' | 'critique' | 'irregularity' | 'note'

export type Standout = {
  id: string
  kind: StandoutKind
  title: string
  detail: string
}

const limit = 6

const irregularities = new Set([
  'clicks',
  'dropouts',
  'gaps',
  'bursts',
  'silence-start',
  'silence-end',
  'silence',
  'dips',
])

const recommendations = new Set(['loudness', 'ceiling', 'movement'])

const kindLabel: Record<StandoutKind, string> = {
  recommendation: 'Recommendation',
  critique: 'Critique',
  irregularity: 'Irregularity',
  note: 'Note',
}

export function standoutLabel(kind: StandoutKind): string {
  return kindLabel[kind]
}

/** A few things worth knowing, not a list of every note in the report. */
export function standouts(report: Report): Standout[] {
  const findings = report.chapters.flatMap((chapter) => chapter.findings)
  const grouped: Record<StandoutKind, Standout[]> = {
    irregularity: [],
    critique: [],
    recommendation: [],
    note: [],
  }

  for (const finding of findings) {
    const kind = kindOf(finding)
    if (!kind) continue
    grouped[kind].push({
      id: finding.id,
      kind,
      title: finding.title,
      detail: kind === 'recommendation' ? finding.tip : finding.explanation,
    })
  }

  const key = report.figures.find((figure) => figure.label === 'Key')
  if (key) {
    grouped.note.push({
      id: 'key',
      kind: 'note',
      title: `The key reads as ${key.value} ${key.unit}`,
      detail: 'Strong enough to trust as a key center. It is not a chord chart.',
    })
  }
  const tempo = report.figures.find((figure) => figure.label === 'Tempo')
  if (tempo) {
    const alternate = tempo.unit.split('·')[1]?.trim()
    grouped.note.push({
      id: 'tempo',
      kind: 'note',
      title: `Tempo sits near ${tempo.value} BPM`,
      detail: alternate
        ? `${alternate} BPM is also plausible, far enough away to be a different feel.`
        : 'The pulse is steady enough to read. Half time or double time can still be the feel you tap.',
    })
  }

  const ranked = interleave([grouped.irregularity, grouped.critique, grouped.recommendation, grouped.note])
  if (ranked.length > 0) return ranked.slice(0, limit)

  return [
    {
      id: 'opening',
      kind: 'note',
      title: report.opening,
      detail: '',
    },
  ]
}

function kindOf(finding: Finding): StandoutKind | null {
  if (finding.id.startsWith('resonance-') || irregularities.has(finding.id)) return 'irregularity'
  if (finding.id === 'ceiling' && finding.severity === 'fix') return 'irregularity'
  if (finding.severity === 'good') return null
  if (recommendations.has(finding.id)) return 'recommendation'
  if (finding.severity === 'watch' || finding.severity === 'fix') return 'critique'
  return null
}

function interleave(groups: Standout[][]): Standout[] {
  const out: Standout[] = []
  const longest = Math.max(0, ...groups.map((group) => group.length))
  for (let index = 0; index < longest; index++) {
    for (const group of groups) {
      const item = group[index]
      if (item) out.push(item)
    }
  }
  return out
}
