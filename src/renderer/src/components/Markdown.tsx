import { useMemo, type JSX } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface Props {
  source: string
}

// Renders model-produced Markdown. Output is ALWAYS sanitized with DOMPurify
// before it touches the DOM (analysis text is untrusted LLM output).
export function Markdown({ source }: Props): JSX.Element {
  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false }) as string
    return DOMPurify.sanitize(raw)
  }, [source])

  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
