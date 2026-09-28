import { useEffect, useState } from 'react'
import { standoutLabel, standouts } from '../analysis/standouts'
import type { Report } from '../analysis/types'

export function Standout({ report }: { report: Report }) {
  const items = standouts(report)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [report])

  const item = items[Math.min(index, items.length - 1)]
  if (!item) return null
  const several = items.length > 1

  function step(direction: -1 | 1) {
    setIndex((current) => (current + direction + items.length) % items.length)
  }

  return (
    <section className="standout rise" data-align="opening" aria-roledescription="carousel" aria-label="Things that stand out">
      <div className="standout-head">
        <p className="standout-kicker">{standoutLabel(item.kind)}</p>
        {several ? (
          <div className="standout-nav">
            <button type="button" aria-label="Previous" onClick={() => step(-1)}>
              <Chevron direction="left" />
            </button>
            <span className="standout-count">
              {index + 1} / {items.length}
            </span>
            <button type="button" aria-label="Next" onClick={() => step(1)}>
              <Chevron direction="right" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="standout-copy" key={item.id} aria-live="polite">
        <p className="standout-title">{item.title}</p>
        {item.detail ? <p className="standout-detail">{item.detail}</p> : null}
      </div>
    </section>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M7.4 2.2 L3.6 6 L7.4 9.8' : 'M4.6 2.2 L8.4 6 L4.6 9.8'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
