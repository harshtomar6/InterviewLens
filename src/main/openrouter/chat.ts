import { postJson } from './client'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
}

/** Single non-streaming chat completion. Returns the assistant text content. */
export async function chatComplete(
  model: string,
  messages: LlmMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const res = await postJson<ChatResponse>('/chat/completions', {
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4000
  })
  const content = res.choices?.[0]?.message?.content
  if (!content || !content.trim()) {
    throw new Error('The model returned an empty response.')
  }
  return content.trim()
}
