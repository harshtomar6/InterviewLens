import { createElement, useEffect, useRef, useState, type JSX } from 'react'

interface Props {
  value: string
  onSave: (title: string) => Promise<void> | void
  /** Element used to render the title text when not editing. */
  tag?: 'h1' | 'span'
}

// Inline-editable title: shows text + a pencil; clicking edits with Enter to
// save / Esc to cancel. Stops click propagation so it works inside clickable rows.
export function EditableTitle({ value, onSave, tag = 'span' }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const stop = (e: { stopPropagation: () => void }): void => e.stopPropagation()

  const commit = async (): Promise<void> => {
    const next = draft.trim()
    if (next && next !== value) await onSave(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="editable editing" onClick={stop}>
        <input
          ref={inputRef}
          className="editable-input"
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={() => void commit()}
        />
        <button className="icon-btn" title="Save" onMouseDown={(e) => e.preventDefault()} onClick={() => void commit()}>✓</button>
        <button className="icon-btn" title="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(false)}>✕</button>
      </span>
    )
  }

  return (
    <span className="editable">
      {createElement(tag, { className: 'editable-text' }, value)}
      <button
        className="icon-btn edit"
        title="Rename"
        onClick={(e) => {
          stop(e)
          setEditing(true)
        }}
      >
        ✎
      </button>
    </span>
  )
}
