import {
  CHAT_SYSTEM_PROMPT_V1,
  CHAT_HISTORY_SYSTEM_PROMPT_V1,
  CHAT_BOTH_SYSTEM_PROMPT_V1,
} from '@/lib/prompts/chat-v1.0'
import { wrapUntrustedDocument } from '@/lib/security/promptInjectionGuard'
import type { QueryContextType } from '@/lib/openai/classifyChatQuery'

export function buildChatPrompt({
  contextType,
  contractText,
}: {
  contextType: QueryContextType
  contractText: string
}): string {
  switch (contextType) {
    case 'history':
      return CHAT_HISTORY_SYSTEM_PROMPT_V1
    case 'both':
      return `${CHAT_BOTH_SYSTEM_PROMPT_V1}\n${wrapUntrustedDocument(contractText)}`
    case 'contract':
    default:
      return `${CHAT_SYSTEM_PROMPT_V1}\n${wrapUntrustedDocument(contractText)}`
  }
}

const CONTRACT_TURN_LIMIT = 10
const HISTORY_TURN_LIMIT = 20

/**
 * Trims ascending-order chat history down to the LLM context window for a
 * given classification. A "turn" is one user+assistant exchange (2 messages).
 */
export function selectHistoryForContext<T>(history: T[], contextType: QueryContextType): T[] {
  const turnLimit = contextType === 'history' ? HISTORY_TURN_LIMIT : CONTRACT_TURN_LIMIT
  const messageLimit = turnLimit * 2
  return history.length > messageLimit ? history.slice(-messageLimit) : history
}
