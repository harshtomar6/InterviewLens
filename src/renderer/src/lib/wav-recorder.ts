// Records a MediaStream's audio into an in-memory mono PCM buffer and encodes
// it as a 16-bit WAV. Uses an AudioWorklet (no deprecated ScriptProcessor) so
// long interviews don't glitch. Each track gets its own recorder → two WAVs.

const WORKLET_SOURCE = `
class CollectorProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const channels = input.length
    const frames = input[0].length
    const mono = new Float32Array(frames)
    for (let c = 0; c < channels; c++) {
      const data = input[c]
      for (let i = 0; i < frames; i++) mono[i] += data[i]
    }
    if (channels > 1) for (let i = 0; i < frames; i++) mono[i] /= channels
    // Transfer the buffer to avoid a copy.
    this.port.postMessage(mono, [mono.buffer])
    return true
  }
}
registerProcessor('collector', CollectorProcessor)
`

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2
  const blockAlign = bytesPerSample // mono
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * bytesPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += bytesPerSample
  }
  return buffer
}

export class WavRecorder {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private chunks: Float32Array[] = []
  private total = 0
  private sampleRate = 48000
  private workletUrl: string | null = null

  constructor(private stream: MediaStream) {}

  async start(): Promise<void> {
    const ctx = new AudioContext()
    this.ctx = ctx
    this.sampleRate = ctx.sampleRate

    const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
    this.workletUrl = URL.createObjectURL(blob)
    await ctx.audioWorklet.addModule(this.workletUrl)

    this.source = ctx.createMediaStreamSource(this.stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.node = new AudioWorkletNode(ctx, 'collector')
    this.node.port.onmessage = (e: MessageEvent<Float32Array>): void => {
      const data = e.data
      this.chunks.push(data)
      this.total += data.length
    }

    this.source.connect(this.analyser)
    this.analyser.connect(this.node)
    // Worklet must reach a destination to keep the graph pulling; route to a
    // muted gain so we never play system audio back through the speakers.
    const sink = ctx.createGain()
    sink.gain.value = 0
    this.node.connect(sink)
    sink.connect(ctx.destination)
  }

  /** Current input level 0..1 (RMS), for live meters. */
  level(): number {
    if (!this.analyser) return 0
    const buf = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += (buf[i] ?? 0) ** 2
    return Math.min(1, Math.sqrt(sum / buf.length) * 3)
  }

  /** Stop and return the encoded WAV bytes. */
  async stop(): Promise<{ bytes: ArrayBuffer; durationSec: number }> {
    const merged = new Float32Array(this.total)
    let offset = 0
    for (const c of this.chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    const bytes = encodeWav(merged, this.sampleRate)
    const durationSec = this.total / this.sampleRate

    this.node?.disconnect()
    this.source?.disconnect()
    this.analyser?.disconnect()
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close()
    if (this.workletUrl) URL.revokeObjectURL(this.workletUrl)
    this.chunks = []
    return { bytes, durationSec }
  }
}
