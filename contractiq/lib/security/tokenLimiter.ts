// Single source of truth for size/length ceilings enforced across upload,
// extraction, and chat. Product limits (pages/tokens) are already tighter
// than the general security ceiling and are kept as-is.

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB, matches the storage bucket limit
export const MAX_PAGES = 20
export const MAX_TOKENS = 15_000
export const MIN_WORDS = 100

export const MAX_MESSAGE_LENGTH = 2000

/** Chat messages loaded from the DB per request; env-configurable per security-foundation spec. */
export const MAX_CHAT_HISTORY = Number(process.env.MAX_CHAT_HISTORY) || 100
