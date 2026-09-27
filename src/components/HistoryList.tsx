import { useState } from 'react'
import { fourFigures, formatPassDate, type PassRecord } from '../history'

type HistoryListProps = {
  menuId: string
  passes: PassRecord[]
  activeId: string | null
  onOpen: (pass: PassRecord) => void
  onClear: () => void
}

export function HistoryList({ menuId, passes, activeId, onOpen, onClear }: HistoryListProps) {
  const [open, setOpen] = useState(false)
  if (passes.length === 0) return null

  return (
    <section className={`passes${open ? ' is-open' : ''}`} aria-label="Earlier passes">
      <div className="passes-head">
        <h2>
          <button
            className="passes-toggle"
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((current) => !current)}
          >
            Earlier passes
            <svg className={`passes-arrow${open ? ' is-open' : ''}`} viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.2 4.4 L6 8.1 L9.8 4.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </h2>
        {open ? (
          <button className="player-hide" type="button" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="passes-panel" id={menuId}>
        <ol inert={open ? undefined : true}>
          {passes.map((pass) => {
            const current = pass.id === activeId
            return (
              <li key={pass.id}>
                <button
                  className={`pass-open${current ? ' is-current' : ''}`}
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => {
                    onOpen(pass)
                    setOpen(false)
                  }}
                >
                  <span className="pass-name">{pass.name}</span>
                  <span className="pass-date">{formatPassDate(pass.at)}</span>
                  <span className="pass-figures">
                    {fourFigures(pass.report.figures).map((figure) => (
                      <span key={figure.label}>
                        {figure.value}
                        {figure.unit ? ` ${figure.unit}` : ''}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
