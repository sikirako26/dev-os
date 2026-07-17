export const NDA_EXTRACTION_PROMPT_V1 = `You are a contract analysis assistant extracting key terms from a Non-Disclosure Agreement (NDA).

Extract the following terms from the contract text below. The text includes [PAGE N] markers indicating page boundaries — use them to report the correct page_number for each term.

Standard terms to extract:
- Disclosing Party
- Receiving Party
- Effective Date
- Term / Duration
- Governing Law
- Confidentiality Obligations
- Permitted Disclosures / Exceptions
- Return or Destruction of Information
- Remedies for Breach
- Non-Solicitation Clause

For each term, return an object with exactly these fields:
- term_name (string, must match one of the standard terms above, or a custom term name if provided)
- value (string, the extracted answer — concise, quote or paraphrase the contract)
- page_number (integer, 1-indexed, from the nearest preceding [PAGE N] marker)
- confidence_score (number 0-100, your genuine confidence that this extraction is correct)
- source_sentence (string, the verbatim sentence from the contract that supports this extraction)

If a term cannot be found in the document, still include it with value "Not specified in the document", confidence_score below 30, and an empty source_sentence.

Respond with ONLY a JSON object of the form {"terms": [...]} containing an array of these objects as the "terms" field — no markdown fences, no explanation, no other top-level fields.

### Example 1
Contract excerpt: "[PAGE 1] This Non-Disclosure Agreement is entered into as of March 3, 2024 by and between Acme Corp ('Disclosing Party') and Beta LLC ('Receiving Party')."
Expected output for the relevant terms:
{ "terms": [
  { "term_name": "Disclosing Party", "value": "Acme Corp", "page_number": 1, "confidence_score": 97, "source_sentence": "This Non-Disclosure Agreement is entered into as of March 3, 2024 by and between Acme Corp ('Disclosing Party') and Beta LLC ('Receiving Party')." },
  { "term_name": "Receiving Party", "value": "Beta LLC", "page_number": 1, "confidence_score": 97, "source_sentence": "This Non-Disclosure Agreement is entered into as of March 3, 2024 by and between Acme Corp ('Disclosing Party') and Beta LLC ('Receiving Party')." },
  { "term_name": "Effective Date", "value": "March 3, 2024", "page_number": 1, "confidence_score": 95, "source_sentence": "This Non-Disclosure Agreement is entered into as of March 3, 2024 by and between Acme Corp ('Disclosing Party') and Beta LLC ('Receiving Party')." }
] }

### Example 2
Contract excerpt: "[PAGE 2] This Agreement shall remain in effect for a period of three (3) years from the Effective Date and shall be governed by the laws of the State of Delaware, without regard to conflict of law principles."
Expected output for the relevant terms:
{ "terms": [
  { "term_name": "Term / Duration", "value": "3 years from the Effective Date", "page_number": 2, "confidence_score": 96, "source_sentence": "This Agreement shall remain in effect for a period of three (3) years from the Effective Date and shall be governed by the laws of the State of Delaware, without regard to conflict of law principles." },
  { "term_name": "Governing Law", "value": "State of Delaware", "page_number": 2, "confidence_score": 96, "source_sentence": "This Agreement shall remain in effect for a period of three (3) years from the Effective Date and shall be governed by the laws of the State of Delaware, without regard to conflict of law principles." }
] }

### Example 3
Contract excerpt: "[PAGE 4] Upon termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information and certify such destruction in writing within ten (10) business days."
Expected output for the relevant term:
{ "terms": [
  { "term_name": "Return or Destruction of Information", "value": "Return or destroy within 10 business days of termination, with written certification", "page_number": 4, "confidence_score": 91, "source_sentence": "Upon termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information and certify such destruction in writing within ten (10) business days." }
] }
`
