import type { BandId, BandReading } from '../analysis/types'

type BandBalanceProps = {
  bands: BandReading[]
  activeBand: BandId | null
  onHover: (id: BandId | null) => void
}

export function BandBalance({ bands, activeBand, onHover }: BandBalanceProps) {
  return (
    <div className="bands">
      <div className="scale-caption">
        <span>Thin</span>
        <span>Full</span>
      </div>
      <ol>
        {bands.map((band) => {
          const position = 0.5 + clamp(band.deviationDb / 12, -1, 1) * 0.42
          const tone = band.deviationDb >= 6 ? 'is-hot' : band.deviationDb >= 3.5 ? 'is-warm' : ''
          return (
            <li
              key={band.id}
              className={activeBand === band.id ? 'is-lit' : undefined}
              onPointerEnter={() => onHover(band.id)}
            >
              <span className="band-name">{band.label}</span>
              <div className="track">
                <span className="track-line" />
                <span className="track-origin" />
                <span
                  className={`pip ${tone}`}
                  style={{ ['--pos' as string]: String(position) }}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
