import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

type ContourProps = {
  caption: string
  values: number[]
  floor: number
  ceiling: number
  center?: number
  drawn: boolean
  duration: number
  subscribe?: (listener: (time: number) => void) => () => void
  onSeek?: (time: number) => void
}

const viewWidth = 1000
const viewHeight = 92
const plotTop = 10
const plotBottom = 74
const plotLeft = 8
const plotRight = 992

export function Contour({ caption, values, floor, ceiling, center, drawn, duration, subscribe, onSeek }: ContourProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const [length, setLength] = useState(0)
  const labelId = useId()
  const d = linePath(values, floor, ceiling)

  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path) return
    setLength(path.getTotalLength())
  }, [d])

  useEffect(() => {
    if (!subscribe) return
    return subscribe((time) => {
      const head = headRef.current
      if (!head || duration <= 0) return
      head.style.left = `${(time / duration) * 100}%`
    })
  }, [subscribe, duration])

  if (values.length < 2) return null

  const centerY = center === undefined ? null : yOf(center, floor, ceiling)

  return (
    <figure className="contour">
      <div className="spectrum-key" id={labelId}>
        {caption}
      </div>
      <div className="contour-frame">
        <svg
          ref={svgRef}
          className="spectrum-svg"
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          role="img"
          aria-labelledby={labelId}
          onClick={(event) => {
            const svg = svgRef.current
            if (!svg || !onSeek || duration <= 0) return
            const rect = svg.getBoundingClientRect()
            const ratio = (event.clientX - rect.left) / rect.width
            onSeek(Math.min(1, Math.max(0, ratio)) * duration)
          }}
        >
          {centerY !== null ? <line className="spectrum-axis" x1={plotLeft} y1={centerY} x2={plotRight} y2={centerY} /> : null}
          <line className="spectrum-axis" x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} />
          <path
            ref={pathRef}
            className={drawn && length > 0 ? 'contour-path is-drawn' : 'contour-path'}
            d={d}
            style={length > 0 ? { strokeDasharray: `${length}`, strokeDashoffset: `${length}` } : undefined}
          />
        </svg>
        {subscribe ? <div ref={headRef} className="playhead contour-head" /> : null}
      </div>
    </figure>
  )
}

export function levelWindow(values: number[]): { floor: number; ceiling: number } {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return { floor: -36, ceiling: 0 }
  const ceiling = Math.max(...finite)
  return { floor: ceiling - 18, ceiling }
}

function yOf(value: number, floor: number, ceiling: number): number {
  const span = ceiling - floor || 1
  const clamped = Math.min(ceiling, Math.max(floor, value))
  return plotBottom - ((clamped - floor) / span) * (plotBottom - plotTop)
}

function linePath(values: number[], floor: number, ceiling: number): string {
  if (values.length < 2) return ''
  return values
    .map((value, index) => {
      const x = plotLeft + (index / (values.length - 1)) * (plotRight - plotLeft)
      const command = index === 0 ? 'M' : 'L'
      return `${command}${x.toFixed(1)} ${yOf(value, floor, ceiling).toFixed(1)}`
    })
    .join(' ')
}
