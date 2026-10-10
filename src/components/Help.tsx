import { useEffect, useId, useRef, useState } from 'react'

const always = [
  [
    'Loudness, 5.',
    'With a lot of club records, very loud and barely moving, hot with the peaks still moving, with quieter records, or quiet even for ambient.',
  ],
  ['Movement, 3.', 'The level barely moves, still open, or moderate.'],
  ['Ceiling, 4.', 'Samples clipped, true peak above full scale, inside the last decibel, or headroom.'],
  ['Image, 5.', 'Mono, left and right fighting, a lot of the mix in the sides, nearly mono, or stable.'],
  ['Low end, 3.', 'Bass too wide, a bit wide, or centered.'],
] as const

const sometimes = [
  'Six irregularities: clicks, a waveform jump, dropouts, a noise burst, silence at the start, silence at the end.',
  'Loud passages marked on the timeline.',
  'The loud stretch sitting above the quiet stretch.',
  'Phase dips.',
  'The image leaning left or right.',
  'Loud parts stacked in the center.',
  'Upper mids rough as well as loud.',
  'Energy under 30 Hz as loud as the sub you can hear.',
  'Twelve band notes: each of the six bands, too much or too little. If none of them stand out, one note says the tilt is balanced.',
  'A silent file, which replaces the rest.',
]

export function Help() {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const panelId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  function close() {
    setOpen(false)
    if (panelRef.current?.contains(document.activeElement)) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      if (panelRef.current?.contains(document.activeElement)) buttonRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <div className={`help-backdrop${open ? ' is-open' : ''}`} onClick={close} />
      <section
        ref={panelRef}
        className={`help-panel${open ? ' is-open' : ''}`}
        id={panelId}
        role="dialog"
        aria-modal={open || undefined}
        aria-hidden={!open}
        aria-labelledby={titleId}
        inert={!open}
      >
        <div className="help-head">
          <h2 id={titleId}>What this app does</h2>
          <button type="button" className="help-close" onClick={close} aria-label="Close">
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
              The report can write 47 distinct cases. A track never gets all of them. It gets the one case that matches in
              each group, plus whichever of the other notes are actually present.
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
              confident tempo can appear there too. A key, when one is confident, stays in the figures.
            </p>
          </div>
        </section>
      <button
        ref={buttonRef}
        type="button"
        className="help-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        ?
      </button>
    </>
  )
}
