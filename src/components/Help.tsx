import { useEffect, useId, useState } from 'react'

const always = [
  [
    'Loudness, 5.',
    'Loudness is in a finished-master range, the peaks are gone, hotter than a finished-master range, quieter than a finished-master range, or this master is quite quiet.',
  ],
  ['Movement, 3.', 'Flattened, still open, or moderate.'],
  ['Ceiling, 4.', 'Samples clipping, true peak above full scale, true peak close, or headroom.'],
  ['Image, 5.', 'Mono, left and right fighting, very wide, nearly mono, or stable.'],
  ['Low end, 3.', 'Bass too wide, a bit wide, or centered.'],
] as const

const sometimes = [
  'Six irregularities: clicks, a digital glitch, dropouts, a noise burst, silence at the start, silence at the end.',
  'Loud passages marked on the timeline.',
  'Phase dips.',
  'The image leaning left or right.',
  'Loud parts stacked in the center.',
  'Upper mids rough as well as loud.',
  'A narrow resonance. The same note, up to twice.',
  'Twelve band notes: each of the six bands, too much or too little. If none of them stand out, one note says the tilt is balanced.',
  'A silent file, which replaces the rest.',
]

export function Help() {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {open ? <div className="help-backdrop" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <section className="help-panel" id={panelId} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="help-head">
            <h2 id={titleId}>What this app does</h2>
            <button type="button" className="help-close" onClick={() => setOpen(false)} aria-label="Close">
              Close
            </button>
          </div>
          <div className="help-body">
            <p>
              Listening pass reads a stereo mix and writes a short report. It is a second set of ears for loudness, tone,
              and the stereo image. The file stays on this device.
            </p>
            <p>
              The pass measures the whole mix, then groups what it finds into dynamics, frequency, and space. A second
              file can sit beside the first, with the difference written next to the matching numbers. The arrows at the
              top step through a few things that stand out. The chapters underneath keep the full notes.
            </p>
            <p>
              The report can write 46 distinct cases. A track never gets all of them. It gets the one case that matches in
              each group, plus any irregularities that are actually present.
            </p>
            <h3>Always one of these</h3>
            <ul>
              {always.map(([name, rest]) => (
                <li key={name}>
                  <strong>{name}</strong> {rest}
                </li>
              ))}
            </ul>
            <h3>Only when the data shows it</h3>
            <ul>
              {sometimes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              The heavy-sub note has a second tip when those hits are also using up the limiter. The words above it stay
              the same.
            </p>
            <p>
              The top of the report shows at most six of these, and it skips the ones that only say things are fine. A
              confident key or tempo can appear there too.
            </p>
          </div>
        </section>
      ) : null}
      <button
        type="button"
        className="help-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
    </>
  )
}
