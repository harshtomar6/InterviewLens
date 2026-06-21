// Acquires the two audio streams that define the whole app:
//   mic    = getUserMedia          (always the user)
//   system = getDisplayMedia loopback (always the other person)

export class CaptureError extends Error {
  constructor(
    message: string,
    readonly kind: 'mic-denied' | 'system-denied' | 'no-system-audio' | 'unknown'
  ) {
    super(message)
    this.name = 'CaptureError'
  }
}

export async function getMicStream(deviceId?: string): Promise<MediaStream> {
  // Echo cancellation is ON deliberately: the other person is played through the
  // speakers and would otherwise bleed into the mic track, polluting speaker
  // separation. AEC uses the system playout as a reference to cancel that bleed.
  // (Headphones eliminate the bleed entirely — recommended in pre-flight.)
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
  if (deviceId) constraints.deviceId = { exact: deviceId }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false })
  } catch (err) {
    throw new CaptureError(
      `Microphone access failed: ${(err as Error).message}. Grant mic permission in System Settings → Privacy & Security → Microphone.`,
      'mic-denied'
    )
  }
}

/**
 * Loopback system audio. Chromium requires a video constraint to open the
 * display-capture pipeline even though we only want audio — so we request
 * video, then immediately stop and drop the video track, keeping only audio.
 */
export async function getSystemStream(): Promise<MediaStream> {
  let raw: MediaStream
  try {
    raw = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true
    })
  } catch (err) {
    throw new CaptureError(
      `System-audio capture was denied: ${(err as Error).message}. Grant Screen Recording permission in System Settings → Privacy & Security → Screen Recording, then restart the app.`,
      'system-denied'
    )
  }

  // Drop video — we never use or display it.
  for (const track of raw.getVideoTracks()) {
    track.stop()
    raw.removeTrack(track)
  }

  const audioTracks = raw.getAudioTracks()
  if (audioTracks.length === 0) {
    throw new CaptureError(
      'No system audio was captured. The loopback handler may not be installed, or nothing is playing through system output.',
      'no-system-audio'
    )
  }

  // Repack into a clean audio-only stream.
  const audioOnly = new MediaStream()
  for (const t of audioTracks) audioOnly.addTrack(t)
  return audioOnly
}

export async function listMicDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}
