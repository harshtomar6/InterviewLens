# InterviewLens 🎙️

An open-source Electron desktop app that records a video-call interview (Zoom, Meet, etc. — **audio only**), transcribes it, and gives **role-aware AI feedback**. It works for **both sides of the table**.

> ⚠️ **Consent:** Recording another person may require their consent. Many jurisdictions have **two-party consent** laws. Make sure everyone on the call knows they are being recorded. InterviewLens shows a consent gate before every recording.

---

## The core idea

At setup you answer one question: **are you the Interviewer or the Candidate?** That single choice drives everything.

1. **Speaker labels without diarization.** Two audio tracks are captured separately:
   - your **microphone** → always *you*
   - **system / loopback audio** → always the *other person*

   So in Interviewer mode, mic = `Interviewer`, system = `Candidate`. In Candidate mode the labels simply swap. No diarization model needed — the track *is* the speaker.

2. **Opposite reports from the same transcript.**
   - **Interviewer mode** → evaluate the *candidate* against the job description: competency scores with evidence quotes, weak/unverified claims, and follow-up questions you should have asked. Decision-support.
   - **Candidate mode** → coach *you*: did you answer the question, answer structure (STAR), clarity, pacing/filler words, strongest & weakest answers, and better phrasings.

---

## Features

- 🎚️ **Two-track capture** — mic + system loopback recorded to two separate WAV files.
- ✂️ **Local pre-processing** — ffmpeg resample to 16 kHz mono, silence/VAD trimming, sub-50s chunking with absolute-offset tracking.
- 📝 **Transcription** via OpenRouter (default `openai/whisper-large-v3`), merged into one interleaved, speaker-labeled transcript.
- 🧠 **Role-specific analysis** via a strong LLM of your choice.
- 💾 **Permanent local library** — every interview (audio, transcript, job description, role, analysis) stored locally in SQLite + a recordings folder.
- 💬 **Ask-questions-later chat** — open any saved interview and ask follow-ups grounded on its transcript. Threads are persisted.
- 📤 **Export** to Markdown or PDF.
- 🔐 **Your key stays local** — stored in the OS keychain (keytar), never logged, never sent anywhere except OpenRouter.

---

## Requirements

- **macOS 13.2+** for system-audio loopback (the app detects and warns on older versions). Windows/Linux build but loopback is verified on macOS.
- **Node.js 20+** and npm.
- An **OpenRouter API key** — get one at [openrouter.ai/keys](https://openrouter.ai/keys).

---

## Install & run (development)

```bash
git clone https://github.com/yourname/interviewlens
cd interviewlens
npm install        # postinstall rebuilds native modules (better-sqlite3, keytar) for Electron
npm run dev        # launches the app with hot reload
```

### macOS permissions (important)

On first recording macOS will prompt for two permissions. **Both are required** or capture silently fails:

1. **Microphone** — for your voice.
2. **Screen Recording** — this governs **system-audio loopback** (the other person's audio). After granting it you may need to **restart the app**.

Grant them under **System Settings → Privacy & Security → Microphone / Screen Recording**. The Pre-flight screen shows live permission status and a level test so you can confirm both tracks before recording.

> 🔇 Loopback captures **all** system audio. Mute music and notifications before recording.

---

## Build & package

```bash
npm run build        # typecheck + bundle main/preload/renderer
npm run test         # run the unit suite (vitest)
npm run package      # unpacked app (dist-app/)
npm run dist:mac     # signed/notarizable .dmg + .zip (configure signing yourself)
```

Packaging is configured in `electron-builder.yml`. macOS `Info.plist` keys (`NSMicrophoneUsageDescription`, `NSAudioCaptureUsageDescription`) and entitlements (`build/entitlements.mac.plist`) are wired up for a hardened-runtime build.

Builds are **unsigned** by default. CI (`.github/workflows/build.yml`) builds macOS + Windows installers on native runners — trigger it from the Actions tab or by pushing a `v*` tag. For code signing & notarization (and replacing the placeholder app icon), see [SIGNING.md](./SIGNING.md).

---

## OpenRouter setup

1. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys).
2. Paste it into the **Setup** screen — it is verified and saved to your OS keychain.
3. Optionally change the models under **Setup → Models**:
   - **Transcription model** — default `openai/whisper-large-v3`.
   - **Analysis model** — default a capable chat model; pick any OpenRouter chat model.

The app talks to two OpenRouter endpoints, both from the **main process** (the renderer never sees your key):
- `POST /api/v1/audio/transcriptions` — per-chunk transcription with segment timestamps.
- `POST /api/v1/chat/completions` — analysis and the ask-later chat.

---

## How it works (pipeline)

After you stop recording, each track is processed **independently**:

```
record ─► two WAVs (mic.wav, system.wav)
              │
   per track: resample 16k mono ─► VAD (silencedetect, drop dead air)
              ─► chunk (<45s, keep absolute offsets) ─► transcribe (rebase timestamps)
              │
        merge: label every segment by role ─► sort by start time
              │
      analyze: role-specific system prompt + job description + transcript
              │
        store: SQLite metadata + local files ─► Results screen
```

---

## Project structure

```
src/
├─ main/                     # Electron main process (Node)
│  ├─ index.ts               # window + system-audio loopback handler
│  ├─ ipc.ts                 # all IPC handlers
│  ├─ permissions.ts         # macOS version + TCC permission checks
│  ├─ export.ts              # Markdown / PDF export
│  ├─ pipeline/              # ffmpeg, VAD, chunking, merge, orchestrator
│  ├─ openrouter/            # client, transcription, chat
│  ├─ analysis/prompts.ts    # interviewer vs candidate system prompts
│  └─ store/                 # sqlite db, files, keychain, settings
├─ preload/                  # contextBridge API
├─ renderer/                 # React UI (Vite)
│  └─ src/
│     ├─ screens/            # Setup, Preflight, Record, Processing, Results, Library
│     ├─ components/         # LevelMeter, Markdown, TranscriptView, ChatBox
│     ├─ hooks/useRecorder.ts
│     └─ lib/                # capture (getUserMedia + loopback), wav-recorder
└─ shared/                   # types, roles, IPC channel names (used by main + renderer)
```

---

## Privacy

Everything is local except the audio/text you send to OpenRouter for transcription and analysis. Recordings, transcripts, and analyses live on your machine under the app's user-data directory (**Library → Open recordings folder**). Delete any interview from the Library to remove its files.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| System meter stays flat | Grant **Screen Recording** permission, restart the app, and make sure audio is actually playing through system output. |
| "No speech detected" | The track was silent — confirm your mic was live and the call audio was playing during recording. |
| Native module errors after `npm install` | Run `npx electron-builder install-app-deps` to rebuild `better-sqlite3`/`keytar` for your Electron version. |
| 401 from OpenRouter | Re-enter your API key in Setup; it must start with `sk-or-`. |

---

## License

[MIT](./LICENSE)
