import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'

/**
 * Resolve the bundled ffmpeg binary path. In a packaged app the binary lives
 * under app.asar.unpacked (configured via asarUnpack), so rewrite the path.
 */
export function ffmpegPath(): string {
  const p = ffmpegStatic as unknown as string
  if (!p) throw new Error('ffmpeg-static did not resolve a binary path')
  return p.replace('app.asar', 'app.asar.unpacked')
}

export interface FfmpegResult {
  stderr: string
}

/** Run ffmpeg with args; resolves on exit 0, rejects with stderr otherwise. */
export function runFfmpeg(args: string[]): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', (err) =>
      reject(new Error(`Failed to launch ffmpeg: ${err.message}`))
    )
    proc.on('close', (code) => {
      if (code === 0) resolve({ stderr })
      else reject(new Error(`ffmpeg exited ${code}:\n${stderr.slice(-2000)}`))
    })
  })
}

/** Resample any input to 16 kHz / 16-bit / mono WAV — clean ASR, small payload. */
export async function resampleTo16kMono(input: string, output: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-i', input,
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    output
  ])
}

// Two-stage sidechain compressor: ducks the mic (input 0) hard whenever the
// system track (input 1) has audio. Removes the other person's speaker bleed
// from the mic track so it isn't transcribed onto the user's side.
const DUCK_FILTER =
  '[1:a]asplit=2[s1][s2];' +
  '[0:a][s1]sidechaincompress=threshold=0.015:ratio=20:attack=2:release=300:level_sc=4[d1];' +
  '[d1][s2]sidechaincompress=threshold=0.015:ratio=20:attack=2:release=300:level_sc=4[out]'

/**
 * Produce a bleed-reduced mic track by ducking it against the system track.
 * Both inputs should already be 16 kHz mono; output is 16 kHz mono PCM.
 */
export async function duckMicWithSystem(
  micIn: string,
  systemIn: string,
  output: string
): Promise<void> {
  await runFfmpeg([
    '-y',
    '-i', micIn,
    '-i', systemIn,
    '-filter_complex', DUCK_FILTER,
    '-map', '[out]',
    '-ar', '16000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    output
  ])
}

/** Get audio duration in seconds via ffmpeg (parsed from stderr). */
export async function probeDuration(input: string): Promise<number> {
  const { stderr } = await runFfmpeg(['-i', input, '-f', 'null', '-'])
    .catch((e: Error) => ({ stderr: e.message }))
  // ffmpeg prints e.g. "time=00:01:23.45" near the end.
  const matches = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)]
  const last = matches[matches.length - 1]
  if (!last) return 0
  const h = parseInt(last[1] ?? '0', 10)
  const m = parseInt(last[2] ?? '0', 10)
  const s = parseFloat(last[3] ?? '0')
  return h * 3600 + m * 60 + s
}
