import { useEffect, useRef, useState, type JSX } from 'react'
import type { ChatMessage } from '@shared/types'
import { Markdown } from './Markdown'

interface Props {
  interviewId: string
}

// Ask-questions-later chat. Persists a single thread per interview (created
// lazily), grounded on the stored transcript + job description in main.
export function ChatBox({ interviewId }: Props): JSX.Element {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const threads = await window.api.listChatThreads(interviewId)
      if (cancelled) return
      const existing = threads[0]
      if (existing) {
        const full = await window.api.getChatThread(existing.id)
        if (cancelled) return
        setThreadId(existing.id)
        setMessages(full?.messages ?? [])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [interviewId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (): Promise<void> => {
    const question = input.trim()
    if (!question || busy) return
    setError(null)
    setBusy(true)
    setInput('')
    // optimistic
    setMessages((m) => [...m, { role: 'user', content: question }])
    try {
      let id = threadId
      if (!id) {
        const thread = await window.api.createChatThread(interviewId, 'Follow-up Q&A')
        id = thread.id
        setThreadId(id)
      }
      const updated = await window.api.chatSend(id, question)
      setMessages(updated)
    } catch (err) {
      setError((err as Error).message)
      setMessages((m) => m.slice(0, -1)) // roll back optimistic
      setInput(question)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chatbox">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="hint">
            Ask follow-up questions about this interview — e.g. “What were the weakest
            answers?” or “Did they give concrete metrics?”
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === 'assistant' ? <Markdown source={m.content} /> : <p>{m.content}</p>}
          </div>
        ))}
        {busy && <div className="chat-msg assistant"><p className="hint">Thinking…</p></div>}
        <div ref={endRef} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="chat-input">
        <textarea
          value={input}
          placeholder="Ask a follow-up…"
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button className="btn primary" onClick={() => void send()} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  )
}
