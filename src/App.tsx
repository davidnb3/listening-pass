import { useEffect, useRef, useState } from 'react'
import { compareMetrics, deltaMap } from './analysis/compare'
import { analyzeFile, isAbort } from './analysis/engine'
import type { Report as ListeningReport } from './analysis/types'
import { Dropzone } from './components/Dropzone'
import { HistoryList } from './components/HistoryList'
import { Mark } from './components/Mark'
import { Player } from './components/Player'
import { Report } from './components/Report'
import { loadPasses, remember, storePasses, type PassRecord } from './history'
import { usePairedText } from './hooks/usePairedText'
import { usePlayer } from './hooks/usePlayer'
import { useReducedMotion } from './hooks/useReducedMotion'

type Phase = 'idle' | 'listening' | 'settling' | 'ready' | 'closing' | 'opening'

export default function App() {
  const reduce = useReducedMotion()
  const player = usePlayer()
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [track, setTrack] = useState<{ name: string; duration: number } | null>(null)
  const [report, setReport] = useState<ListeningReport | null>(null)
  const [passes, setPasses] = useState<PassRecord[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [paired, setPaired] = useState(false)
  const [otherReport, setOtherReport] = useState<ListeningReport | null>(null)
  const [otherName, setOtherName] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  const [compareProgress, setCompareProgress] = useState(0)
  const [compareError, setCompareError] = useState<string | null>(null)
  const pending = useRef<File | null>(null)
  const run = useRef(0)
  const compareRun = useRef(0)
  const advanced = useRef<Phase | null>(null)
  const reportRef = useRef<ListeningReport | null>(null)
  const buffers = useRef(new Map<string, AudioBuffer>())
  const compareInput = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const adoptCompare = useRef(0)
  const [otherId, setOtherId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadPasses().then((saved) => {
      if (live) setPasses(saved)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  useEffect(() => {
    advanced.current = null
    if (reduce) return
    if (phase !== 'settling' && phase !== 'opening' && phase !== 'closing') return
    const delay = phase === 'closing' ? 460 : 820
    const timer = window.setTimeout(() => advance(phase), delay)
    return () => window.clearTimeout(timer)
  }, [phase, reduce])

  useEffect(() => {
    if (phase !== 'ready') player.pause()
  }, [phase, player])

  function savePass(name: string, next: ListeningReport, buffer: AudioBuffer | null) {
    const id = crypto.randomUUID()
    const record: PassRecord = { id, name, at: Date.now(), report: next }
    if (buffer) buffers.current.set(id, buffer)
    setPasses((current) => {
      const saved = remember(current, record)
      void storePasses(saved)
      return saved
    })
    return id
  }

  function closePair() {
    compareRun.current += 1
    adoptCompare.current = 0
    setOtherId(null)
    setPaired(false)
    setComparing(false)
    setOtherReport(null)
    setOtherName(null)
    setCompareError(null)
  }

  function closeCurrent() {
    if (comparing && otherName) {
      adoptCompare.current = compareRun.current
      setPaired(false)
      setComparing(false)
      setOtherReport(null)
      setCompareError(null)
      setReport(null)
      reportRef.current = null
      setActiveId(null)
      player.clear()
      setError(null)
      setProgress(compareProgress)
      setTrack({ name: otherName, duration: 0 })
      setOtherName(null)
      setPhase('listening')
      return
    }
    if (otherReport && otherName) {
      const id = otherId
      const next = otherReport
      const name = otherName
      closePair()
      reportRef.current = next
      setReport(next)
      setActiveId(id)
      setTrack({ name, duration: next.metrics.duration })
      setProgress(1)
      setPhase('ready')
      const buffer = id ? buffers.current.get(id) : undefined
      if (buffer) player.load(buffer)
      else player.clear()
      return
    }
    closePair()
    run.current += 1
    pending.current = null
    player.clear()
    setReport(null)
    reportRef.current = null
    setActiveId(null)
    setTrack(null)
    setError(null)
    setProgress(0)
    setPhase('idle')
  }

  function showPass(record: PassRecord) {
    setError(null)
    reportRef.current = record.report
    setReport(record.report)
    setActiveId(record.id)
    setTrack({ name: record.name, duration: record.report.metrics.duration })
    setProgress(1)
    setPhase('ready')
    const buffer = buffers.current.get(record.id)
    if (buffer) player.load(buffer)
    else player.clear()
  }

  function start(file: File) {
    const id = ++run.current
    closePair()
    player.clear()
    setError(null)
    setReport(null)
    reportRef.current = null
    setActiveId(null)
    setProgress(0.02)
    setTrack({ name: file.name, duration: 0 })
    setPhase('listening')
    analyzeFile(file, (ratio) => {
      if (run.current === id) setProgress(ratio)
    }).then(
      ({ report: next, buffer }) => {
        if (run.current !== id) return
        const savedId = savePass(file.name, next, buffer)
        player.load(buffer)
        reportRef.current = next
        setReport(next)
        setActiveId(savedId)
        setTrack({ name: file.name, duration: next.metrics.duration })
        setProgress(1)
        setPhase(reduce ? 'ready' : 'settling')
      },
      (reason: unknown) => {
        if (run.current !== id || isAbort(reason)) return
        setReport(null)
        setError(reason instanceof Error ? reason.message : 'This file could not be read.')
        setPhase('idle')
      },
    )
  }

  function advance(from: Phase) {
    if (advanced.current === from) return
    advanced.current = from
    if (from === 'settling') {
      setPhase('ready')
      return
    }
    if (from === 'closing') {
      setReport(null)
      setPhase('opening')
      return
    }
    if (from === 'opening') {
      const file = pending.current
      pending.current = null
      if (file) start(file)
      else setPhase('idle')
    }
  }

  function compareFile(file: File) {
    if (!reportRef.current) return
    const id = ++compareRun.current
    setPaired(true)
    setComparing(true)
    setCompareError(null)
    setCompareProgress(0.02)
    setOtherName(file.name)
    setOtherReport(null)
    analyzeFile(file, (ratio) => {
      if (compareRun.current !== id) return
      if (adoptCompare.current === id) setProgress(ratio)
      else setCompareProgress(ratio)
    }).then(
      ({ report: other, buffer }) => {
        if (compareRun.current !== id) return
        const savedId = savePass(file.name, other, buffer)
        if (adoptCompare.current === id) {
          adoptCompare.current = 0
          setOtherId(null)
          player.load(buffer)
          reportRef.current = other
          setReport(other)
          setActiveId(savedId)
          setTrack({ name: file.name, duration: other.metrics.duration })
          setProgress(1)
          setPaired(false)
          setComparing(false)
          setPhase(reduce ? 'ready' : 'settling')
          return
        }
        setOtherId(savedId)
        setOtherReport(other)
        setOtherName(file.name)
        setComparing(false)
        setCompareProgress(1)
      },
      (reason: unknown) => {
        if (compareRun.current !== id || isAbort(reason)) return
        if (adoptCompare.current === id) {
          adoptCompare.current = 0
          setReport(null)
          setError(reason instanceof Error ? reason.message : 'This file could not be read.')
          setPhase('idle')
          return
        }
        setComparing(false)
        setCompareError(reason instanceof Error ? reason.message : 'This file could not be read.')
      },
    )
  }

  function clearPasses() {
    buffers.current.clear()
    setPasses([])
    setActiveId(null)
    void storePasses([])
  }

  function takeFile(file: File) {
    setError(null)
    setTrack((current) => ({ name: file.name, duration: current?.duration ?? 0 }))
    if (phase === 'ready' || phase === 'settling') {
      pending.current = file
      if (reduce) start(file)
      else setPhase('closing')
      return
    }
    if (phase === 'closing' || phase === 'opening') {
      pending.current = file
      return
    }
    start(file)
  }

  function openPass(record: PassRecord) {
    if (phase !== 'idle' && phase !== 'ready') return
    if (record.id === activeId) return
    showPass(record)
  }

  function openOther(record: PassRecord) {
    if (phase !== 'ready' || !reportRef.current) return
    if (record.id === otherId && paired && !comparing) return
    compareRun.current += 1
    adoptCompare.current = 0
    setPaired(true)
    setComparing(false)
    setCompareError(null)
    setCompareProgress(1)
    setOtherId(record.id)
    setOtherName(record.name)
    setOtherReport(record.report)
  }

  const slim = phase === 'settling' || phase === 'ready' || phase === 'closing'
  const showReport = report !== null && (phase === 'ready' || phase === 'closing')
  const status =
    phase === 'listening'
      ? `Listening to ${track?.name ?? 'the mix'}`
      : comparing
        ? `Listening to ${otherName ?? 'the other mix'}`
        : phase === 'ready'
          ? 'Notes are ready.'
          : ''
  const showPlayer = phase === 'ready' && player.duration > 0
  const compared = paired && report !== null && otherReport !== null && !comparing
  const comparison = compared
    ? compareMetrics(report.metrics, otherReport.metrics, otherName ?? 'the other file')
    : null
  const leftDeltas = comparison ? deltaMap(comparison, 1) : null
  const rightDeltas = comparison ? deltaMap(comparison, -1) : null
  usePairedText(stageRef, compared, compared ? `${activeId ?? ''}:${otherId ?? ''}` : '')

  const currentTrack = (
    <>
      <div className="column-head">
        <HistoryList
          menuId="passes-current"
          passes={passes}
          activeId={activeId}
          onOpen={openPass}
          onClear={clearPasses}
        />
        {phase === 'ready' && !paired ? (
          <div className="compare-launch">
            <button className="player-hide" type="button" onClick={() => compareInput.current?.click()}>
              Compare
            </button>
            <input
              ref={compareInput}
              className="sr-only"
              type="file"
              accept="audio/*,.wav,.mp3,.aac,.m4a,.flac,.ogg,.aiff,.aif"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) compareFile(file)
              }}
            />
          </div>
        ) : null}
      </div>
      <Dropzone
        slim={slim}
        listening={phase === 'listening'}
        progress={progress}
        error={phase === 'idle' ? error : null}
        name={track?.name ?? null}
        duration={track?.duration ?? 0}
        onFile={takeFile}
        onHeightEnd={() => advance(phase)}
        onClose={paired ? closeCurrent : undefined}
      />
      {showReport && report ? (
        <Report
          key={activeId ?? 'current'}
          report={report}
          visible={phase === 'ready'}
          leaving={phase === 'closing'}
          onLeft={() => advance('closing')}
          player={player}
          deltas={leftDeltas}
        />
      ) : null}
    </>
  )

  return (
    <main className={`page${paired ? ' is-paired' : ''}${showPlayer && player.open ? ' has-player' : ''}`}>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      <header className="mast arrive">
        <Mark className="mark" />
        <h1>Listening pass</h1>
      </header>
      <p className={`lede arrive arrive-2${phase === 'idle' ? '' : ' is-gone'}`}>
        A listening pass on your mix. The file stays on this device.
      </p>
      <div ref={stageRef} className={`stage${paired ? ' is-paired' : ''}${compared ? ' is-compared' : ''}`}>
        <div className="pair-col">{currentTrack}</div>
        {paired ? (
          <div className="pair-col pair-next">
            <div className="column-head">
              <HistoryList
                menuId="passes-other"
                passes={passes}
                activeId={otherId}
                onOpen={openOther}
                onClear={clearPasses}
              />
            </div>
            <Dropzone
              slim={Boolean(otherReport) && !comparing}
              listening={comparing}
              progress={compareProgress}
              error={compareError}
              name={otherName}
              duration={otherReport?.metrics.duration ?? 0}
              onFile={compareFile}
              onHeightEnd={() => undefined}
              onClose={closePair}
            />
            {otherReport && !comparing ? (
              <Report report={otherReport} visible leaving={false} onLeft={() => undefined} deltas={rightDeltas} />
            ) : null}
          </div>
        ) : null}
      </div>
      {showPlayer ? <Player player={player} name={track?.name ?? 'the mix'} /> : null}
    </main>
  )
}
