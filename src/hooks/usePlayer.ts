import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sampleLiveSpectrum } from '../analysis/dsp'
import { getAudioContext } from '../audio'

type Listener = (time: number) => void

export type Player = {
  playing: boolean
  open: boolean
  duration: number
  load: (buffer: AudioBuffer) => void
  clear: () => void
  pause: () => void
  seek: (time: number, andPlay?: boolean) => void
  toggle: () => void
  close: () => void
  reveal: () => void
  subscribe: (listener: Listener) => () => void
  readLive: (targets: number[]) => number[] | null
  isPlaying: () => boolean
}

export function usePlayer(): Player {
  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const binsRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const offsetRef = useRef(0)
  const startedAtRef = useRef(0)
  const tokenRef = useRef(0)
  const playingRef = useRef(false)
  const listeners = useRef(new Set<Listener>())
  const frame = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(0)

  const notify = useCallback((time: number) => {
    for (const listener of listeners.current) listener(time)
  }, [])

  const currentTime = useCallback(() => {
    const buffer = bufferRef.current
    if (!buffer) return 0
    if (!playingRef.current) return offsetRef.current
    const elapsed = getAudioContext().currentTime - startedAtRef.current
    return Math.min(buffer.duration, Math.max(0, offsetRef.current + elapsed))
  }, [])

  const loop = useRef<() => void>(() => {})
  loop.current = () => {
    notify(currentTime())
    frame.current = requestAnimationFrame(() => loop.current())
  }

  const stopSource = useCallback(() => {
    const source = sourceRef.current
    sourceRef.current = null
    if (!source) return
    source.onended = null
    try {
      source.stop()
    } catch {
      /* already stopped */
    }
  }, [])

  const pause = useCallback(() => {
    if (!playingRef.current) return
    offsetRef.current = currentTime()
    playingRef.current = false
    setPlaying(false)
    stopSource()
    cancelAnimationFrame(frame.current)
    notify(offsetRef.current)
  }, [currentTime, notify, stopSource])

  const playAt = useCallback(
    (time: number) => {
      const buffer = bufferRef.current
      if (!buffer) return
      const context = getAudioContext()
      void context.resume()
      stopSource()
      const start = Math.min(Math.max(0, time), Math.max(0, buffer.duration - 0.01))
      offsetRef.current = start
      const source = context.createBufferSource()
      source.buffer = buffer
      if (!analyserRef.current) {
        const analyser = context.createAnalyser()
        analyser.fftSize = 4096
        analyser.smoothingTimeConstant = 0.8
        analyser.connect(context.destination)
        analyserRef.current = analyser
        binsRef.current = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * Float32Array.BYTES_PER_ELEMENT))
      }
      source.connect(analyserRef.current)
      const token = ++tokenRef.current
      source.onended = () => {
        if (token !== tokenRef.current) return
        playingRef.current = false
        setPlaying(false)
        offsetRef.current = buffer.duration
        cancelAnimationFrame(frame.current)
        notify(buffer.duration)
        sourceRef.current = null
      }
      startedAtRef.current = context.currentTime
      source.start(0, start)
      sourceRef.current = source
      playingRef.current = true
      setPlaying(true)
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => loop.current())
      notify(start)
    },
    [notify, stopSource],
  )

  const load = useCallback(
    (buffer: AudioBuffer) => {
      tokenRef.current += 1
      stopSource()
      playingRef.current = false
      setPlaying(false)
      cancelAnimationFrame(frame.current)
      bufferRef.current = buffer
      offsetRef.current = 0
      setDuration(buffer.duration)
      setOpen(true)
      notify(0)
    },
    [notify, stopSource],
  )

  const clear = useCallback(() => {
    tokenRef.current += 1
    stopSource()
    playingRef.current = false
    setPlaying(false)
    setOpen(false)
    setDuration(0)
    bufferRef.current = null
    offsetRef.current = 0
    cancelAnimationFrame(frame.current)
    notify(0)
  }, [notify, stopSource])

  const seek = useCallback(
    (time: number, andPlay = false) => {
      const buffer = bufferRef.current
      if (!buffer) return
      const next = Math.min(Math.max(0, time), buffer.duration)
      if (andPlay || playingRef.current) playAt(next)
      else {
        offsetRef.current = next
        notify(next)
      }
    },
    [notify, playAt],
  )

  const toggle = useCallback(() => {
    if (playingRef.current) {
      pause()
      return
    }
    const buffer = bufferRef.current
    const restart = buffer ? offsetRef.current >= buffer.duration - 0.05 : false
    playAt(restart ? 0 : offsetRef.current)
  }, [pause, playAt])

  const close = useCallback(() => {
    pause()
    setOpen(false)
  }, [pause])

  const reveal = useCallback(() => setOpen(true), [])

  const subscribe = useCallback(
    (listener: Listener) => {
      listeners.current.add(listener)
      listener(currentTime())
      return () => {
        listeners.current.delete(listener)
      }
    },
    [currentTime],
  )

  const readLive = useCallback((targets: number[]) => {
    const analyser = analyserRef.current
    const bins = binsRef.current
    const buffer = bufferRef.current
    if (!playingRef.current || !analyser || !bins || !buffer) return null
    analyser.getFloatFrequencyData(bins)
    const levels = sampleLiveSpectrum(bins, buffer.sampleRate, analyser.fftSize, targets)
    return levels.length ? levels : null
  }, [])

  const isPlaying = useCallback(() => playingRef.current, [])

  useEffect(
    () => () => {
      tokenRef.current += 1
      stopSource()
      cancelAnimationFrame(frame.current)
    },
    [stopSource],
  )

  return useMemo(
    () => ({
      playing,
      open,
      duration,
      load,
      clear,
      pause,
      seek,
      toggle,
      close,
      reveal,
      subscribe,
      readLive,
      isPlaying,
    }),
    [playing, open, duration, load, clear, pause, seek, toggle, close, reveal, subscribe, readLive, isPlaying],
  )
}
