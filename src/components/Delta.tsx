import { formatSigned } from '../analysis/format'

type DeltaProps = {
  value: number
  digits: number
}

export function Delta({ value, digits }: DeltaProps) {
  const shown = Number(value.toFixed(digits))
  if (shown === 0) return null
  const up = shown > 0
  return <span className={`delta${up ? ' is-up' : ' is-down'}`}>{formatSigned(shown, digits)}</span>
}
