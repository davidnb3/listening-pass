import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatSigned, formatTime } from '../analysis/format'
import type { Marker } from '../analysis/types'

type TimelineProps = {
  waveform: number[]
  duration: number
  markers: Marker[]
  active: boolean
  subscribe?: (listener: (time: number) => void) => () => void
  onSeek?: (time: number) => void
  onHear?: (time: number) => void
}

const viewWidth = 1000
const viewHeight = 120

export function Timeline({ waveform, duration, markers, active, subscribe, onSeek, onHear }: TimelineProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const [length, setLength] = useState(0)
  const d = wavePath(smoothPeaks(waveform))

  useEffect(() => {
    if (!subscribe) return
    return subscribe((time) => {
      const head = headRef.current
      if (!head || duration <= 0) return
      head.style.left = `${(time / duration) * 100}%`
    })
  }, [subscribe, duration])

  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path) return
    setLength(path.getTotalLength())
  }, [d])

  const stamps = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className={`timeline${onSeek ? ' is-seekable' : ''}`}>
      <svg
        ref={svgRef}
        className="timeline-svg"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        role="img"
        aria-label="Waveform of the mix"
        onClick={(event) => {
          const svg = svgRef.current
          if (!svg || !onSeek || duration <= 0) return
          const rect = svg.getBoundingClientRect()
          const ratio = (event.clientX - rect.left) / rect.width
          onSeek(Math.min(1, Math.max(0, ratio)) * duration)
        }}
      >
        <line className="timeline-axis" x1="0" y1="58" x2={viewWidth} y2="58" />
        <path
          ref={pathRef}
          className={active && length > 0 ? 'wave-path is-drawn' : 'wave-path'}
          d={d}
          style={length > 0 ? { strokeDasharray: `${length}`, strokeDashoffset: `${length}` } : undefined}
        />
      </svg>
      <div className="timeline-stamps" aria-hidden="true">
        {stamps.map((stamp) => (
          <span key={stamp}>{formatTime(duration * stamp)}</span>
        ))}
      </div>
      <div className="timeline-ticks">
        {onSeek ? <div ref={headRef} className="playhead" /> : null}
        {markers.map((marker) => {
          const place = duration > 0 ? marker.time / duration : 0
          const hot = marker.kind === 'phase' && marker.value < 0
          const warm = marker.kind === 'phase' && marker.value >= 0
          const label =
            marker.kind === 'peak'
              ? `${formatTime(marker.time)} · ${formatSigned(marker.value)} LUFS`
              : `${formatTime(marker.time)} · ${formatSigned(marker.value, 2)}`
          return (
            <button
              key={`${marker.kind}-${marker.time.toFixed(2)}`}
              type="button"
              className={`tick${hot ? ' is-hot' : ''}${warm ? ' is-warm' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onHear?.(marker.time)
              }}
              style={{
                left: `${place * 100}%`,
                animationDelay: `${Math.round(place * 860)}ms`,
              }}
            >
              <span className="tick-label">{label}</span>
              <span className="sr-only">{marker.kind === 'peak' ? 'Loud passage' : 'Phase dip'} {label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function smoothPeaks(peaks: number[]): number[] {
  const radius = 8
  return peaks.map((_, index) => {
    let sum = 0
    let count = 0
    for (let cursor = index - radius; cursor <= index + radius; cursor++) {
      const value = peaks[cursor]
      if (value === undefined) continue
      sum += value
      count += 1
    }
    return count > 0 ? sum / count : 0
  })
}

function wavePath(peaks: number[]): string {
  if (peaks.length < 2) return ''
  const mid = 58
  const amp = 42
  const top = peaks.map((peak, index) => {
    const x = (index / (peaks.length - 1)) * viewWidth
    const y = mid - peak * amp
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  })
  const bottom = [...peaks]
    .reverse()
    .map((peak, index) => {
      const source = peaks.length - 1 - index
      const x = (source / (peaks.length - 1)) * viewWidth
      const y = mid + peak * amp
      return `L${x.toFixed(1)} ${y.toFixed(1)}`
    })
  return `${top.join(' ')} ${bottom.join(' ')} Z`
}
