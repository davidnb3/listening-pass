import { useRef, useState, type MouseEvent } from 'react'
import { formatTime } from '../analysis/format'

type DropzoneProps = {
  slim: boolean
  listening: boolean
  progress: number
  error: string | null
  name: string | null
  duration: number
  onFile: (file: File) => void
  onHeightEnd: () => void
  onClose?: () => void
}

export function Dropzone({
  slim,
  listening,
  progress,
  error,
  name,
  duration,
  onFile,
  onHeightEnd,
  onClose,
}: DropzoneProps) {
  const [drag, setDrag] = useState(false)
  const depth = useRef(0)

  function take(list: FileList | null) {
    const file = list?.[0]
    if (!file) return
    depth.current = 0
    setDrag(false)
    onFile(file)
  }

  function close(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    onClose?.()
  }

  return (
    <label
      className={`zone${slim ? ' is-slim' : ''}${drag ? ' is-drag' : ''}${listening ? ' is-listening' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        depth.current += 1
        setDrag(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) {
          depth.current = 0
          setDrag(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        take(event.dataTransfer.files)
      }}
      onTransitionEnd={(event) => {
        if (event.propertyName === 'height' && event.target === event.currentTarget) onHeightEnd()
      }}
    >
      <input
        className="sr-only"
        type="file"
        accept="audio/*,.wav,.mp3,.aac,.m4a,.flac,.ogg,.aiff,.aif"
        onChange={(event) => {
          take(event.target.files)
          event.target.value = ''
        }}
      />
      {onClose && !slim ? (
        <button className="zone-close" type="button" aria-label="Close this track" onClick={close}>
          <CloseIcon />
        </button>
      ) : null}
      <span className="zone-stack">
        <span className={`zone-large${slim ? ' is-hidden' : ''}`} aria-hidden={slim}>
          {listening && name ? (
            <span className="listen-copy" key={name}>
              <span className="listen-name">{name}</span>
              <span className="listen-state">Listening</span>
            </span>
          ) : (
            <span className="idle-copy">
              <svg className="hint-wave" viewBox="0 0 128 36" aria-hidden="true">
                <path d="M4 20 H28 C36 20 38 8 50 8 C62 8 64 30 76 30 C88 30 90 20 100 20 H124" />
              </svg>
              <span className="drop-title">Drop a mix</span>
              <span className="drop-hint">
                <span className={drag ? 'is-hidden' : ''}>or click to browse</span>
                <span className={drag ? '' : 'is-hidden'}>Release to listen</span>
              </span>
              <span className="drop-formats">WAV, MP3, and AAC. FLAC depends on the browser.</span>
            </span>
          )}
          {error ? <span className="zone-error" role="alert">{error}</span> : null}
        </span>
        <span className={`zone-slim${slim ? '' : ' is-hidden'}${onClose ? ' has-close' : ''}`} aria-hidden={!slim}>
          <span className="slim-name">{name}</span>
          <span className="slim-meta">{duration > 0 ? formatTime(duration) : ''}</span>
          <span className="slim-actions">
            <span className="slim-replace">Replace</span>
            {onClose ? (
              <button className="slim-close" type="button" aria-label="Close this track" onClick={close}>
                <CloseIcon />
              </button>
            ) : null}
          </span>
        </span>
      </span>
      <span
        className="hairline"
        style={{ transform: `scaleX(${listening ? progress : 0})` }}
        role={listening ? 'progressbar' : undefined}
        aria-valuemin={listening ? 0 : undefined}
        aria-valuemax={listening ? 100 : undefined}
        aria-valuenow={listening ? Math.round(progress * 100) : undefined}
        aria-label={listening ? 'Listening' : undefined}
      />
    </label>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.2 2.2 L9.8 9.8 M9.8 2.2 L2.2 9.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
