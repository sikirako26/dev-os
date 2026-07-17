export type ContractType = 'NDA' | 'MSA'
export type ContractStatus = 'uploaded' | 'processing' | 'complete' | 'error'
export type ChatRole = 'user' | 'assistant'
export type ChatContextSource = 'contract' | 'history' | 'both'
export type FeedbackRating = 'up' | 'down'

export interface Contract {
  id: string
  user_id: string
  contract_type: ContractType
  file_path: string | null
  contract_text: string
  status: ContractStatus
  page_count: number
  token_count: number
  created_at: string
  updated_at: string
  last_accessed_at: string
}

export interface KeyTerm {
  id: string
  contract_id: string
  term_name: string
  value: string
  original_value: string
  page_number: number
  confidence_score: number
  source_sentence: string | null
  is_edited: boolean
  is_manual: boolean
  created_at: string
}

export interface CustomKeyTerm {
  id: string
  contract_id: string
  term_name: string
  value: string | null
  original_value: string | null
  page_number: number | null
  confidence_score: number | null
  source_sentence: string | null
  is_edited: boolean
  is_manual: boolean
  created_at: string
}

export interface ChatSession {
  id: string
  contract_id: string
  user_id: string
  created_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  role: ChatRole
  content: string
  page_citation: number | null
  context_source: ChatContextSource | null
  created_at: string
}

export interface UserFeedback {
  id: string
  user_id: string
  contract_id: string
  rating: FeedbackRating
  comment: string | null
  created_at: string
}

export interface TermCorrection {
  id: string
  key_term_id: string | null
  custom_key_term_id: string | null
  original_value: string
  corrected_value: string
  corrected_at: string
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

export interface ExtractedTerm {
  term_name: string
  value: string
  page_number: number
  confidence_score: number
  source_sentence: string
}
