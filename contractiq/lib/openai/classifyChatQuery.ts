export type QueryContextType = 'contract' | 'history' | 'both'

// Signals that the question is about the conversation itself, not the document.
const HISTORY_PATTERNS = [
  /\bwe (just |already )?(discussed|talked about|covered|went over)\b/i,
  /\byou (just )?(said|mentioned|told me|asked|answered)\b/i,
  /\bi (just )?(said|asked|mentioned)\b/i,
  /\b(earlier|previously|before)\b/i,
  /\bwhat (did|have) (i|we) (ask|discuss|say|cover)/i,
  /\b(summarize|summarise|recap) (this|our|the) (chat|conversation|discussion)\b/i,
  /\b(this|our|the) (conversation|chat|discussion)\b/i,
  /\bmy (last|previous|first) (question|message)\b/i,
  /\byour (last|previous|first) (answer|response|reply)\b/i,
]

// Signals that the question is about the document's contents.
const CONTRACT_PATTERNS = [
  /\bclause(s)?\b/i,
  /\bsection(s)?\b/i,
  /\bpage(s)?\b/i,
  /\bterm(s)?\b/i,
  /\bcontract\b/i,
  /\bagreement\b/i,
  /\brenewal\b/i,
  /\btermination\b/i,
  /\bliabilit(y|ies)\b/i,
  /\bindemnif/i,
  /\bpart(y|ies)\b/i,
  /\beffective date\b/i,
  /\bexpir(e|y|ation)\b/i,
  /\bobligation(s)?\b/i,
  /\bpayment(s)?\b/i,
  /\bconfidential/i,
]

/**
 * Heuristic query classifier — deliberately not a separate LLM call (see
 * contract-chat.md §1.5c). Runs on the raw user question before any context
 * is fetched, so it must not depend on conversation state.
 */
export function classifyChatQuery(question: string): QueryContextType {
  const hasHistorySignal = HISTORY_PATTERNS.some((pattern) => pattern.test(question))
  const hasContractSignal = CONTRACT_PATTERNS.some((pattern) => pattern.test(question))

  if (hasHistorySignal && hasContractSignal) return 'both'
  if (hasHistorySignal) return 'history'
  return 'contract'
}
