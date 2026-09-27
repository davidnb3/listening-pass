let context: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!context || context.state === 'closed') context = new AudioContext()
  return context
}
