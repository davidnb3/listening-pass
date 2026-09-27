import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../analysis/format'
import type { Player as PlayerApi } from '../hooks/usePlayer'

type PlayerProps = {
  player: PlayerApi
  name: string
}

export function Player({ player, name }: PlayerProps) {
  const [time, setTime] = useState(0)
  const wasPlaying = useRef(false)

  useEffect(() => player.subscribe(setTime), [player])

  if (!player.open) {
    return (
      <button className="player-pill" type="button" onClick={player.reveal}>
        Listen
      </button>
    )
  }

  const ratio = player.duration > 0 ? Math.min(1, time / player.duration) : 0

  return (
    <div className="player" role="region" aria-label={`Playback, ${name}`}>
      <button className="player-play" type="button" onClick={player.toggle} aria-label={player.playing ? 'Pause' : 'Play'}>
        {player.playing ? <PauseMark /> : <PlayMark />}
      </button>
      <input
        className="scrub"
        type="range"
        min={0}
        max={player.duration || 0}
        step={0.01}
        value={Math.min(time, player.duration || 0)}
        style={{ ['--p' as string]: `${ratio * 100}%` }}
        aria-label="Playhead"
        aria-valuetext={formatTime(time)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          wasPlaying.current = player.isPlaying()
          if (wasPlaying.current) player.pause()
        }}
        onChange={(event) => player.seek(Number(event.target.value))}
        onPointerUp={() => {
          if (!wasPlaying.current) return
          wasPlaying.current = false
          player.toggle()
        }}
      />
      <span className="player-time">
        {formatTime(time)}
        <span className="player-total"> / {formatTime(player.duration)}</span>
      </span>
      <button className="player-hide" type="button" onClick={player.close}>
        Hide
      </button>
    </div>
  )
}

function PlayMark() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.2 1.8v8.4L10 6z" />
    </svg>
  )
}

function PauseMark() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 2h2v8H3zm4 0h2v8H7z" />
    </svg>
  )
}
