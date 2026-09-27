type WidthProps = {
  width: number
  balance: number
  correlation: number
}

export function Width({ width, balance, correlation }: WidthProps) {
  const image = clamp(width / 0.3, 0, 1)
  const lean = 0.5 + clamp(balance / 0.4, -0.5, 0.5)
  const imageTone = correlation < 0.15 ? 'is-hot' : correlation < 0.35 || width > 0.28 ? 'is-warm' : ''
  const leanTone = Math.abs(balance) >= 0.22 ? 'is-hot' : Math.abs(balance) >= 0.12 ? 'is-warm' : ''

  return (
    <div className="widths">
      <Row label="Image" start="Narrow" end="Wide" position={image} tone={imageTone} />
      <Row label="Balance" start="Left" end="Right" position={lean} tone={leanTone} />
    </div>
  )
}

function Row({
  label,
  start,
  end,
  position,
  tone,
}: {
  label: string
  start: string
  end: string
  position: number
  tone: string
}) {
  return (
    <div className="width-row">
      <span className="band-name">{label}</span>
      <div className="track">
        <span className="track-line" />
        <span className="track-end start">{start}</span>
        <span className="track-end end">{end}</span>
        <span className={`pip ${tone}`} style={{ ['--pos' as string]: String(position) }} />
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
