import { NDA_EXTRACTION_PROMPT_V1 } from '@/lib/prompts/nda-v1.0'
import { MSA_EXTRACTION_PROMPT_V1 } from '@/lib/prompts/msa-v1.0'
import { wrapUntrustedDocument } from '@/lib/security/promptInjectionGuard'
import type { ContractType } from '@/types'

interface ExtractionPromptInput {
  contractType: ContractType
  contractText: string
  customTerms: string[]
}

const SYSTEM_PROMPTS: Record<ContractType, string> = {
  NDA: NDA_EXTRACTION_PROMPT_V1,
  MSA: MSA_EXTRACTION_PROMPT_V1,
}

export function buildExtractionPrompt({
  contractType,
  contractText,
  customTerms,
}: ExtractionPromptInput): { system: string; user: string } {
  const customTermsBlock =
    customTerms.length > 0
      ? `\n\nIn addition to the standard terms, also extract these custom terms requested by the user (use the exact term_name given, follow the same output schema, and apply the same confidence/source-sentence rules): ${customTerms
          .map((t) => `"${t}"`)
          .join(', ')}.`
      : ''

  return {
    system: SYSTEM_PROMPTS[contractType] + customTermsBlock,
    user: `Contract text (with [PAGE N] markers):\n\n${wrapUntrustedDocument(contractText)}`,
  }
}
