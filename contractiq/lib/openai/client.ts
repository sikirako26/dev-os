import OpenAI from 'openai'
import type { ExtractedTerm } from '@/types'

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const BACKOFF_DELAYS_MS = [1000, 2000, 4000]

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= BACKOFF_DELAYS_MS.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < BACKOFF_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, BACKOFF_DELAYS_MS[attempt]))
      }
    }
  }
  throw lastError
}

function parseExtractionResponse(raw: string): ExtractedTerm[] {
  const parsed = JSON.parse(raw)
  const terms = Array.isArray(parsed) ? parsed : parsed.terms
  if (!Array.isArray(terms)) throw new Error('Expected a JSON array of terms')

  return terms.map((t) => ({
    term_name: String(t.term_name),
    value: String(t.value),
    page_number: Number(t.page_number) || 1,
    confidence_score: Math.max(0, Math.min(100, Number(t.confidence_score) || 0)),
    source_sentence: String(t.source_sentence ?? ''),
  }))
}

export async function callExtraction(systemPrompt: string, userPrompt: string): Promise<ExtractedTerm[]> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const first = await withBackoff(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages,
    })
  )

  const firstContent = first.choices[0]?.message?.content ?? ''

  try {
    return parseExtractionResponse(firstContent)
  } catch {
    // One automatic retry with a stricter instruction, per key-term-extraction.md
    const retryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...messages,
      { role: 'assistant', content: firstContent },
      {
        role: 'user',
        content:
          'Return only a valid JSON object of the form {"terms": [...]}, no explanation, no markdown fences.',
      },
    ]

    const retry = await withBackoff(() =>
      openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: retryMessages,
      })
    )

    const retryContent = retry.choices[0]?.message?.content ?? ''
    return parseExtractionResponse(retryContent) // propagates if still unparseable
  }
}

export interface ChatCallResult {
  content: string
  pageCitation: number | null
}

export async function callChat(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  question: string
): Promise<ChatCallResult> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.ChatCompletionMessageParam),
    { role: 'user', content: question },
  ]

  const response = await withBackoff(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 1000,
      messages,
    })
  )

  const content = response.choices[0]?.message?.content ?? ''
  const citationMatch = content.match(/\[Page (\d+)\]/i)
  const pageCitation = citationMatch ? Number(citationMatch[1]) : null

  return { content, pageCitation }
}
