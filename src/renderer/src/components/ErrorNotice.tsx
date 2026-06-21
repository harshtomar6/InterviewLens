import { useState, type JSX } from 'react'
import { cleanError } from '../lib/format'

interface Props {
  error: string | undefined
  phase: 'transcription' | 'analysis'
}

// Shows a clean one-line failure summary; the raw technical text (e.g. an
// OpenRouter JSON error) is tucked behind a "Details" disclosure.
export function ErrorNotice({ error, phase }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const { summary, details } = cleanError(error, phase)
  return (
    <div className="error-notice">
      <div className="error-notice-head">
        <span className="error-ico">⚠</span>
        <span>{summary}</span>
        {details && (
          <button className="link-btn" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide details' : 'Details'}
          </button>
        )}
      </div>
      {open && details && <pre className="error-details">{details}</pre>}
    </div>
  )
}
