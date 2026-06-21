import { BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'fs'
import type { Interview, TrackSource } from '@shared/types'
import { labelForTrack } from '@shared/roles'
import { formatTranscript } from './pipeline/merge'
import { pathExists, trackPath } from './store/files'

function interviewToMarkdown(interview: Interview): string {
  const date = new Date(interview.createdAt).toLocaleString()
  const lens = interview.role === 'interviewer' ? 'Candidate evaluation' : 'Candidate coaching'
  const transcript = interview.transcript
    ? formatTranscript(interview.transcript)
    : '_No transcript available._'
  return `# ${interview.title}

- **Role:** ${interview.role} (${lens})
- **Date:** ${date}
- **Duration:** ${Math.round(interview.durationSec)}s

${interview.jobDescription.trim() ? `## Job Description\n\n${interview.jobDescription.trim()}\n` : ''}
## Analysis

${interview.analysisMarkdown ?? '_No analysis available._'}

## Transcript

\`\`\`
${transcript}
\`\`\`
`
}

export async function exportMarkdown(interview: Interview): Promise<string | null> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export interview as Markdown',
    defaultPath: `${sanitize(interview.title)}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (canceled || !filePath) return null
  await fs.writeFile(filePath, interviewToMarkdown(interview), 'utf8')
  return filePath
}

// Minimal HTML escaping for the PDF render path.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function interviewToHtml(interview: Interview): string {
  const md = interviewToMarkdown(interview)
  // Render as preformatted text — dependency-free and faithful. Good enough for
  // an export artifact without pulling in a full Markdown renderer in main.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 13px/1.6 -apple-system, system-ui, sans-serif; padding: 40px; color: #111; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
  </style></head><body><pre>${esc(md)}</pre></body></html>`
}

export async function exportPdf(interview: Interview): Promise<string | null> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export interview as PDF',
    defaultPath: `${sanitize(interview.title)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return null

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  try {
    await win.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(interviewToHtml(interview))
    )
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    await fs.writeFile(filePath, pdf)
    return filePath
  } finally {
    win.destroy()
  }
}

/** Save a copy of one recorded WAV track, named by its speaker label. */
export async function exportTrack(
  interview: Interview,
  source: TrackSource
): Promise<string | null> {
  const src = trackPath(interview.id, source)
  if (!(await pathExists(src))) {
    throw new Error(`The ${source} track file is missing on disk.`)
  }
  const speaker = labelForTrack(interview.role, source)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: `Export ${speaker} (${source}) track`,
    defaultPath: `${sanitize(interview.title)} - ${speaker}.wav`,
    filters: [{ name: 'WAV audio', extensions: ['wav'] }]
  })
  if (canceled || !filePath) return null
  await fs.copyFile(src, filePath)
  return filePath
}

function sanitize(name: string): string {
  return name.replace(/[^\w\-. ]+/g, '_').slice(0, 80) || 'interview'
}
