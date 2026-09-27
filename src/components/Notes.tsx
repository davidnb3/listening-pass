import type { DeltaMap } from '../analysis/compare'
import type { Finding } from '../analysis/types'
import { Delta } from './Delta'

type NotesProps = {
  findings: Finding[]
  delay: number
  chapterId: string
  deltas: DeltaMap | null
}

export function Notes({ findings, delay, chapterId, deltas }: NotesProps) {
  return (
    <ol className="notes">
      {findings.map((finding, index) => (
        <li
          key={finding.id}
          className="note rise"
          style={{ animationDelay: `${delay + index * 50}ms` }}
        >
          <h3 className="note-title" data-align={`title-${chapterId}-${index}`}>
            {finding.severity === 'fix' ? <span className="dot dot-hot" /> : null}
            {finding.severity === 'watch' ? <span className="dot dot-peach" /> : null}
            {finding.title}
          </h3>
          <p data-align={`body-${chapterId}-${index}`}>{finding.explanation}</p>
          <p className="note-tip" data-align={`tip-${chapterId}-${index}`}>
            {finding.tip}
          </p>
          {finding.evidence.length > 0 || deltas ? (
            <p className="note-evidence" data-align={`evidence-${chapterId}-${index}`}>
              {finding.evidence.map((item) => {
                const delta = deltas?.[item.label]
                return (
                  <span key={`${item.label}-${item.value}`}>
                    <span className="evidence-label">{item.label}</span>
                    <span className="evidence-value">{item.value}</span>
                    {delta ? <Delta value={delta.value} digits={delta.digits} /> : null}
                  </span>
                )
              })}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
