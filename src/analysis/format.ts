export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${remain.toString().padStart(2, '0')}`
}

export function formatSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  const fixed = value.toFixed(digits)
  return value > 0 ? `+${fixed}` : fixed
}

export function db(value: number): number {
  if (value <= 1e-9) return -120
  return 20 * Math.log10(value)
}

export function joinTimes(times: number[]): string {
  return times.map((time) => formatTime(time)).join(', ')
}

export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return '—'
  if (hz >= 1000) {
    const kilo = hz / 1000
    return `${kilo >= 10 ? kilo.toFixed(0) : kilo.toFixed(1)} kHz`
  }
  return `${Math.round(hz)} Hz`
}
