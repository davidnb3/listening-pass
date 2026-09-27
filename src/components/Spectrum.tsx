import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BAND_RANGES, SPECTRUM_FLOOR_DB } from '../analysis/dsp'
import { formatHz, formatSigned } from '../analysis/format'
import type { BandId, Resonance, SpectrumPoint } from '../analysis/types'

type SpectrumProps = {
  points: SpectrumPoint[]
  resonances: Resonance[]
  activeBand: BandId | null
  onHover: (id: BandId | null) => void
  drawn: boolean
  playing: boolean
  readLive: (targets: number[]) => number[] | null
}

const viewWidth = 1000
const viewHeight = 196
const plotTop = 16
const plotBottom = 156
const plotLeft = 8
const plotRight = 992

export function Spectrum({ points, resonances, activeBand, onHover, drawn, playing, readLive }: SpectrumProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const liveRef = useRef<SVGPathElement>(null)
  const [length, setLength] = useState(0)
  const labelId = useId()
  const minHz = points[0]?.hz ?? 20
  const maxHz = points[points.length - 1]?.hz ?? 20000
  const average = spectrumPath(points, minHz, maxHz)
  const targets = useMemo(() => points.map((point) => point.hz), [points])

  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path) return
    setLength(path.getTotalLength())
  }, [average])

  useEffect(() => {
    const live = liveRef.current
    if (!live) return
    if (!playing) {
      live.setAttribute('d', '')
      return
    }
    let frame = 0
    const tick = () => {
      const levels = readLive(targets)
      live.setAttribute('d', levels ? livePath(targets, levels, minHz, maxHz) : '')
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, readLive, targets, minHz, maxHz])

  if (points.length < 2) return null

  const stamps = [100, 1000, 10000].filter((hz) => hz > minHz && hz < maxHz)

  return (
    <figure className="spectrum">
      <div className="spectrum-key">
        <span id={labelId}>
          <i className="key-average" /> Average
        </span>
        {playing ? (
          <span>
            <i className="key-now" /> Now
          </span>
        ) : null}
      </div>
      <svg className="spectrum-svg" viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="img" aria-labelledby={labelId}>
        {BAND_RANGES.map((range) => {
          const slice = sliceBox(range.from, range.to, minHz, maxHz)
          if (!slice) return null
          return (
            <rect
              key={range.id}
              className={`spectrum-region${activeBand === range.id ? ' is-lit' : ''}`}
              x={slice.x}
              y={plotTop}
              width={slice.width}
              height={plotBottom - plotTop}
            />
          )
        })}
        <line className="spectrum-axis" x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} />
        <path
          ref={pathRef}
          className={drawn && length > 0 ? 'spectrum-line is-drawn' : 'spectrum-line'}
          d={average}
          style={length > 0 ? { strokeDasharray: `${length}`, strokeDashoffset: `${length}` } : undefined}
        />
        <path ref={liveRef} className="spectrum-live" d="" />
        {BAND_RANGES.map((range) => {
          const slice = sliceBox(range.from, range.to, minHz, maxHz)
          if (!slice) return null
          return (
            <rect
              key={`${range.id}-hit`}
              className="spectrum-hit"
              x={slice.x}
              y={plotTop}
              width={slice.width}
              height={plotBottom - plotTop}
              onPointerEnter={() => onHover(range.id)}
            />
          )
        })}
        {resonances.map((peak) => {
          const x = xOf(peak.hz, minHz, maxHz)
          const y = yOf(levelAt(peak.hz, points))
          const label = `${formatHz(peak.hz)} · ${formatSigned(peak.prominenceDb, 0)} dB`
          return (
            <g key={peak.hz} className="spectrum-mark">
              <rect x={x - 10} y={plotTop} width={20} height={plotBottom - plotTop} />
              <line x1={x} y1={y - 14} x2={x} y2={plotBottom} />
              <text x={x} y={Math.max(12, y - 18)}>
                {label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="spectrum-stamps" aria-hidden="true">
        {stamps.map((hz) => (
          <span key={hz} style={{ left: `${((xOf(hz, minHz, maxHz) - plotLeft) / (plotRight - plotLeft)) * 100}%` }}>
            {formatHz(hz)}
          </span>
        ))}
      </div>
    </figure>
  )
}

function sliceBox(from: number, to: number, minHz: number, maxHz: number): { x: number; width: number } | null {
  const x0 = xOf(Math.max(from, minHz), minHz, maxHz)
  const x1 = xOf(Math.min(to, maxHz), minHz, maxHz)
  if (x1 - x0 < 2) return null
  return { x: x0, width: x1 - x0 }
}

function levelAt(hz: number, points: SpectrumPoint[]): number {
  let best = SPECTRUM_FLOOR_DB
  let distance = Infinity
  for (const point of points) {
    const next = Math.abs(Math.log(point.hz) - Math.log(hz))
    if (next < distance) {
      distance = next
      best = point.db
    }
  }
  return best
}

function xOf(hz: number, minHz: number, maxHz: number): number {
  const span = Math.log(maxHz) - Math.log(minHz)
  const ratio = span > 0 ? (Math.log(hz) - Math.log(minHz)) / span : 0
  return plotLeft + clamp(ratio, 0, 1) * (plotRight - plotLeft)
}

function yOf(db: number): number {
  const ratio = (0 - db) / -SPECTRUM_FLOOR_DB
  return plotTop + clamp(ratio, 0, 1) * (plotBottom - plotTop)
}

function spectrumPath(points: SpectrumPoint[], minHz: number, maxHz: number): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command}${xOf(point.hz, minHz, maxHz).toFixed(1)} ${yOf(point.db).toFixed(1)}`
    })
    .join(' ')
}

function livePath(hz: number[], levels: number[], minHz: number, maxHz: number): string {
  return hz
    .map((frequency, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command}${xOf(frequency, minHz, maxHz).toFixed(1)} ${yOf(levels[index] ?? SPECTRUM_FLOOR_DB).toFixed(1)}`
    })
    .join(' ')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
