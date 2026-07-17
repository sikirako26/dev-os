import type { ContractType } from '@/types'

export const STANDARD_TERMS: Record<ContractType, string[]> = {
  NDA: [
    'Disclosing Party',
    'Receiving Party',
    'Effective Date',
    'Term / Duration',
    'Governing Law',
    'Confidentiality Obligations',
    'Permitted Disclosures / Exceptions',
    'Return or Destruction of Information',
    'Remedies for Breach',
    'Non-Solicitation Clause',
  ],
  MSA: [
    'Parties',
    'Effective Date',
    'Term / Termination',
    'Scope of Services',
    'Payment Terms',
    'Governing Law',
    'Limitation of Liability',
    'Indemnification',
    'Confidentiality',
    'Intellectual Property Ownership',
    'Auto-Renewal Clause',
    'Dispute Resolution',
  ],
}

export const MAX_CUSTOM_TERMS = 5
