import { useEffect, useState } from 'react'
import type { DeltaMap } from '../analysis/compare'
import type { BandId, Report as ListeningReport } from '../analysis/types'
import { Delta } from './Delta'
import type { Player as PlayerApi } from '../hooks/usePlayer'
import { BandBalance } from './BandBalance'
import { Contour, levelWindow } from './Contour'
import { Notes } from './Notes'
import { Spectrum } from './Spectrum'
import { Timeline } from './Timeline'
import { Width } from './Width'

type ReportProps = {
  report: ListeningReport
  visible: boolean
  leaving: boolean
  onLeft: () => void
  player?: PlayerApi
  deltas?: DeltaMap | null
}

export function Report({ report, visible, leaving, onLeft, player, deltas = null }: ReportProps) {
  const { metrics } = report
  const [entered, setEntered] = useState(false)
  const [band, setBand] = useState<BandId | null>(null)

  useEffect(() => {
    if (!visible) return
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [visible])

  return (
    <article
      className={`report${entered ? ' is-in' : ''}${leaving ? ' is-leaving' : ''}`}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget || !leaving) return
        onLeft()
      }}
    >
      <p className="opening rise" data-align="opening" style={{ animationDelay: '40ms' }}>
        {report.opening}
      </p>
      <dl className="figures">
        {report.figures.map((figure, index) => {
          const delta = deltas?.[figure.label]
          return (
            <div key={figure.label} className="rise" style={{ animationDelay: `${120 + index * 50}ms` }}>
              <dt>{figure.label}</dt>
              <dd>
                <span className="figure-value">{figure.value}</span>
                {figure.unit ? <span className="figure-unit">{figure.unit}</span> : null}
                {delta ? <Delta value={delta.value} digits={delta.digits} /> : null}
              </dd>
            </div>
          )
        })}
      </dl>
      {report.chapters.map((chapter, index) => (
        <section key={chapter.id} className="chapter">
          <h2 className="rise" style={{ animationDelay: `${360 + index * 80}ms` }}>
            {chapter.label}
          </h2>
          <p className="verdict rise" data-align={`verdict-${chapter.id}`} style={{ animationDelay: `${410 + index * 80}ms` }}>
            {chapter.verdict}
          </p>
          <div className="rise" data-align={`chart-${chapter.id}`} style={{ animationDelay: `${470 + index * 80}ms` }}>
            {chapter.id === 'dynamics' ? (
              <>
              <Timeline
                waveform={metrics.waveform}
                duration={metrics.duration}
                markers={metrics.markers}
                active={visible && !leaving}
                subscribe={player?.subscribe}
                onSeek={player ? (time) => player.seek(time) : undefined}
                onHear={player ? (time) => player.seek(time, true) : undefined}
              />
              <Contour
                caption="Level"
                values={metrics.loudness}
                {...levelWindow(metrics.loudness)}
                drawn={visible && !leaving}
                duration={metrics.duration}
                subscribe={player?.subscribe}
                onSeek={player ? (time) => player.seek(time) : undefined}
              />
              </>
            ) : null}
            {chapter.id === 'frequency' ? (
              <div className="frequency" onPointerLeave={() => setBand(null)}>
                <Spectrum
                  points={metrics.spectrum}
                  resonances={metrics.resonances}
                  activeBand={band}
                  onHover={setBand}
                  drawn={visible && !leaving}
                  playing={player?.playing ?? false}
                  readLive={player ? player.readLive : () => null}
                />
                <BandBalance bands={metrics.bands} activeBand={band} onHover={setBand} />
              </div>
            ) : null}
            {chapter.id === 'space' ? (
              <>
                <Contour
                  caption="Correlation"
                  note="Correlation is how alike the left and right channels are. Near +1, they are almost the same signal, so the mix is narrow and stays put in mono. Near 0, they are unrelated, which is a wide stereo image. Near −1, they are opposite and largely disappear when summed to mono."
                  scale={['+1', '0', '−1']}
                  values={metrics.mono ? [1, 1] : metrics.correlationOverTime}
                  floor={-1}
                  ceiling={1}
                  center={0}
                  drawn={visible && !leaving}
                  duration={metrics.duration}
                  subscribe={player?.subscribe}
                  onSeek={player ? (time) => player.seek(time) : undefined}
                />
                <Width width={metrics.width} balance={metrics.balance} correlation={metrics.correlation} />
              </>
            ) : null}
          </div>
          <Notes findings={chapter.findings} delay={540 + index * 80} chapterId={chapter.id} deltas={deltas} />
        </section>
      ))}
    </article>
  )
}
