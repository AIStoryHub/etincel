/**
 * sourceFacts / elicited-material-unused (etincel-human-signal-spec.md
 * Part 4 "Consumption quota"). The elicitation step (SKILL.md's Step 0.5)
 * asks the user for details a model can't invent honestly; this checks
 * whether the draft actually used any of them, so the step is measurable
 * rather than aspirational.
 *
 * Rule, quoted from the spec: "at least two elicited facts used, and at
 * least one of them in a non-evidentiary sentence", the non-evidentiary
 * test being D4's own (a sentence with no numeral, currency figure,
 * percentage, organisation-class proper noun, or achievement verb). D4
 * itself isn't shipping yet (needs a labeled corpus, see SOURCES.md), but
 * this narrower reuse of its test doesn't: it's a completeness check on
 * facts the user explicitly supplied, not a statistical claim about prose
 * shape in general, so it doesn't need a corpus sweep to justify running.
 */

import { splitParagraphs, splitSentences } from "./structural-detectors.js"

const ACHIEVEMENT_VERBS = new Set([
  "led",
  "grew",
  "built",
  "created",
  "founded",
  "managed",
  "closed",
  "exceeded",
  "delivered",
  "launched",
  "raised",
  "scaled",
])

const NUMERAL_OR_CURRENCY_RE = /\d|[$£€]|%/

/** D4's evidentiary-sentence test, reused here per the spec: a numeral,
 * currency figure, percentage, an organisation-class proper noun (a
 * capitalized word not at the sentence's own start, approximated the same
 * way computeStrengthSignals treats specificity), or an achievement verb. */
function isEvidentiarySentence(sentence: string): boolean {
  if (NUMERAL_OR_CURRENCY_RE.test(sentence)) return true
  const words = sentence.split(/\s+/).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    const clean = words[i].replace(/[^A-Za-z'-]/g, "")
    if (!clean) continue
    if (i > 0 && /^[A-Z][A-Za-z'-]*$/.test(clean)) return true
    if (ACHIEVEMENT_VERBS.has(clean.toLowerCase())) return true
  }
  return false
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "is",
  "was",
  "were",
  "are",
  "be",
  "been",
  "it",
  "its",
  "this",
  "that",
  "i",
  "my",
  "me",
  "he",
  "she",
  "they",
  "we",
  "you",
  "your",
  "his",
  "her",
  "their",
  "our",
])

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function contentWords(text: string): string[] {
  const all = text.toLowerCase().match(/[a-z']+/g) ?? []
  return all.filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

const FACT_USED_OVERLAP_THRESHOLD = 0.5

/** A fact is "used" when at least half of its distinctive content words
 * (stopwords and very short words excluded) show up, as whole words, in
 * the draft. Deliberately word-overlap rather than exact substring: the
 * draft is expected to fold the fact into its own prose, not quote it
 * back verbatim. */
function isFactUsed(fact: string, draftLower: string): boolean {
  const words = contentWords(fact)
  if (words.length === 0) return false
  const hits = words.filter((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`).test(draftLower)).length
  return hits / words.length >= FACT_USED_OVERLAP_THRESHOLD
}

export interface ElicitedMaterialUsage {
  totalFacts: number
  usedFacts: string[]
  unusedFacts: string[]
  /** Whether at least one used fact appears in a sentence that isn't
   * itself proving a qualification (D4's evidentiary test). */
  usedInNonEvidentiarySentence: boolean
  /** usedFacts.length >= 2 && usedInNonEvidentiarySentence, per the
   * spec's quoted rule. */
  meetsQuota: boolean
}

/** Checks sourceFacts usage against a draft. Returns undefined when no
 * facts were supplied: the check is meaningless (and must never fire)
 * without them, this isn't "zero facts used". */
export function checkElicitedMaterial(sourceFacts: string[], text: string): ElicitedMaterialUsage | undefined {
  const facts = sourceFacts.map((f) => f.trim()).filter(Boolean)
  if (facts.length === 0) return undefined

  const sentences = splitParagraphs(text).flatMap(splitSentences)
  const draftLower = text.toLowerCase()
  const usedFacts: string[] = []
  const unusedFacts: string[] = []
  let usedInNonEvidentiarySentence = false

  for (const fact of facts) {
    if (!isFactUsed(fact, draftLower)) {
      unusedFacts.push(fact)
      continue
    }
    usedFacts.push(fact)
    const factWords = contentWords(fact)
    const matchingSentences = sentences.filter((s) =>
      factWords.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(s))
    )
    if (matchingSentences.some((s) => !isEvidentiarySentence(s))) {
      usedInNonEvidentiarySentence = true
    }
  }

  return {
    totalFacts: facts.length,
    usedFacts,
    unusedFacts,
    usedInNonEvidentiarySentence,
    meetsQuota: usedFacts.length >= 2 && usedInNonEvidentiarySentence,
  }
}
