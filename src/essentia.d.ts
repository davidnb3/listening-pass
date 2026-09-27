declare module 'essentia.js/dist/essentia.js-core.es.js' {
  export interface EssentiaVector {
    delete?: () => void
  }

  export default class Essentia {
    constructor(wasmModule: unknown)
    arrayToVector(input: Float32Array): EssentiaVector
    vectorToArray(input: EssentiaVector): Float32Array
    LoudnessEBUR128(
      left: EssentiaVector,
      right: EssentiaVector,
      hopSize?: number,
      sampleRate?: number,
      startAtZero?: boolean,
    ): {
      momentaryLoudness: EssentiaVector
      shortTermLoudness: EssentiaVector
      integratedLoudness: number
      loudnessRange: number
    }
    DynamicComplexity(
      signal: EssentiaVector,
      frameSize?: number,
      sampleRate?: number,
    ): { dynamicComplexity: number; loudness: number }
    Windowing(
      frame: EssentiaVector,
      normalized?: boolean,
      size?: number,
      type?: string,
      zeroPadding?: number,
      zeroPhase?: boolean,
    ): { frame: EssentiaVector }
    Spectrum(frame: EssentiaVector, size?: number): { spectrum: EssentiaVector }
    BarkBands(
      spectrum: EssentiaVector,
      numberBands?: number,
      sampleRate?: number,
    ): { bands: EssentiaVector }
    Centroid(array: EssentiaVector, range?: number): { centroid: number }
    SpectralPeaks(
      spectrum: EssentiaVector,
      magnitudeThreshold?: number,
      maxFrequency?: number,
      maxPeaks?: number,
      minFrequency?: number,
      orderBy?: string,
      sampleRate?: number,
    ): { frequencies: EssentiaVector; magnitudes: EssentiaVector }
    Dissonance(frequencies: EssentiaVector, magnitudes: EssentiaVector): { dissonance: number }
    TruePeakDetector(
      signal: EssentiaVector,
      blockDC?: boolean,
      emphasise?: boolean,
      oversamplingFactor?: number,
      quality?: number,
      sampleRate?: number,
      threshold?: number,
      version?: number,
    ): { peakLocations: EssentiaVector; output: EssentiaVector }
    KeyExtractor(
      audio: EssentiaVector,
      averageDetuningCorrection?: boolean,
      frameSize?: number,
      hopSize?: number,
      hpcpSize?: number,
      maxFrequency?: number,
      maximumSpectralPeaks?: number,
      minFrequency?: number,
      pcpThreshold?: number,
      profileType?: string,
      sampleRate?: number,
      spectralPeaksThreshold?: number,
      tuningFrequency?: number,
      weightType?: string,
      windowType?: string,
    ): { key: string; scale: string; strength: number }
    RhythmExtractor2013(
      signal: EssentiaVector,
      maxTempo?: number,
      method?: string,
      minTempo?: number,
    ): {
      bpm: number
      ticks: EssentiaVector
      confidence: number
      estimates: EssentiaVector
      bpmIntervals: EssentiaVector
    }
    ClickDetector(
      frame: EssentiaVector,
      detectionThreshold?: number,
      frameSize?: number,
      hopSize?: number,
      order?: number,
      powerEstimationThreshold?: number,
      sampleRate?: number,
      silenceThreshold?: number,
    ): { starts: EssentiaVector; ends: EssentiaVector }
    DiscontinuityDetector(
      frame: EssentiaVector,
      detectionThreshold?: number,
      energyThreshold?: number,
      frameSize?: number,
      hopSize?: number,
      kernelSize?: number,
      order?: number,
      silenceThreshold?: number,
      subFrameSize?: number,
    ): { discontinuityLocations: EssentiaVector; discontinuityAmplitudes: EssentiaVector }
    NoiseBurstDetector(
      frame: EssentiaVector,
      alpha?: number,
      silenceThreshold?: number,
      threshold?: number,
    ): { indexes: EssentiaVector }
  }
}

declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export const EssentiaWASM: {
    ready?: Promise<unknown>
    calledRun?: boolean
    onRuntimeInitialized?: () => void
  }
}
