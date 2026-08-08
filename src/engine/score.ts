/**
 * Deterministic AI-slop scorer for non-fiction prose. No LLM call: this is
 * a linter, not a judgment call, so the "audit_text" tool result is
 * inspectable and reproducible (part of the trust-mode promise: the user can
 * see exactly why something got flagged).
 *
 * Density-based scoring adapted from JP LeBlanc's AIStoryHub
 * (lib/tools/ai-slop-scan.ts's scanText, MIT-equivalent internal port, see
 * src/data/SOURCES.md), which was itself built for long-form documents
 * rather than short social copy: total tell strength per 1000 words,
 * saturating toward 100 rather than a raw sum, so one incidental word in an
 * otherwise clean long piece doesn't blow out the score.
 */

import bannedTermsData from "../data/banned-terms.json" with { type: "json" }
import softFlagTermsData from "../data/soft-flag-terms.json" with { type: "json" }
import {
  STRUCTURAL_PATTERNS,
  detectWholePieceRhythm,
  computeStrengthSignals,
  type Confidence,
  type Lifecycle,
  type StrengthSignals,
} from "./structural-detectors.js"

export type Tier = "green" | "yellow" | "orange" | "red"

export interface FindingMatch {
  start: number
  end: number
}

export interface Finding {
  term: string
  category: string
  subcategory: string
  confidence: Confidence
  severity: "critical" | "high" | "medium" | "low"
  count: number
  scored: boolean
  /** Character offsets of each match in the audited text, so a caller can
   * highlight or edit in place instead of re-finding the term by string
   * search. Omitted for whole-piece findings (rhythm), which have no single
   * span. */
  matches?: FindingMatch[]
  replacementHint?: string
  note?: string
}

export interface AuditResult {
  score: number
  tier: Tier
  wordCount: number
  findings: Finding[]
  categoryBreakdown: { category: string; count: number }[]
  summary: string
  /** The other side of the ledger: reasons this piece is working, not just
   * ways it's flagged, see structural-detectors.ts's StrengthSignals. */
  strengths: StrengthSignals
}

export interface AuditOptions {
  /** User-added terms to flag as hard bans, same weight as a corpus entry,
   * see src/engine/dictionaryStore.ts. */
  extraBannedWords?: string[]
  /** User-added terms that should never be flagged, even if they'd
   * otherwise match a built-in or custom-banned entry (case-insensitive,
   * exact-term match): an org's own acronyms, house style, etc. */
  allowedWords?: string[]
  /** Calibrates strictness against the kind of text this is, see
   * REGISTER_DETECTOR_SUPPRESSIONS. Defaults to no suppression ("general"). */
  register?: Register
}

interface CompiledEntry {
  id?: string
  term: string
  category: string
  subcategory: string
  confidence: Confidence
  lifecycle: Lifecycle
  strength: number
  regex: RegExp
  replacementHint?: string
  note?: string
}

/** Registers the "audit_text" tool accepts, matching server.ts's input schema. */
export type Register = "email" | "blog" | "memo" | "essay" | "social" | "docs" | "general"

/** Structural detectors that fire on markup that's correct, not an AI tell,
 * in a given register: a README's headings and bolded terms are valid
 * Markdown, not a chatbot artifact leaking into prose. Suppressed by
 * detector id (STRUCTURAL_PATTERNS entries) when that register is passed. */
const REGISTER_DETECTOR_SUPPRESSIONS: Partial<Record<Register, string[]>> = {
  docs: ["markdown-heading-leak", "markdown-bold-in-prose", "bulleted-bold-term", "title-case-header"],
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function compilePhrase(phrase: string): RegExp {
  const escaped = escapeRegExp(phrase)
  const startsWord = /^\w/.test(phrase)
  const endsWord = /\w$/.test(phrase)
  const pattern = `${startsWord ? "\\b" : ""}${escaped}${endsWord ? "\\b" : ""}`
  return new RegExp(pattern, "gi")
}

// Hard-ban terms are always "red" confidence (flag on sight); soft-flag terms
// are "orange" (flag in clusters / surface as a question, never auto-cut).
const HARD_BAN_STRENGTH = 80
const SOFT_FLAG_STRENGTH = 45

let compiledEntries: CompiledEntry[] | null = null

function getCompiledEntries(): CompiledEntry[] {
  if (compiledEntries) return compiledEntries

  const hardEntries: CompiledEntry[] = (bannedTermsData.entries as any[]).map((e) => ({
    term: e.term,
    category: e.category,
    subcategory: e.subcategory,
    confidence: "red",
    lifecycle: "live",
    strength: HARD_BAN_STRENGTH,
    regex: compilePhrase(e.term),
    replacementHint: e.replacement_hint,
  }))

  const softEntries: CompiledEntry[] = (softFlagTermsData.entries as any[]).map((e) => ({
    term: e.term,
    category: e.category,
    subcategory: e.subcategory,
    confidence: "orange",
    lifecycle: "live",
    strength: SOFT_FLAG_STRENGTH,
    regex: compilePhrase(e.term),
    note: e.note,
  }))

  const structuralEntries: CompiledEntry[] = STRUCTURAL_PATTERNS.map((p) => ({
    id: p.id,
    term: p.term,
    category: p.category,
    subcategory: p.subcategory,
    confidence: p.confidence,
    lifecycle: p.lifecycle ?? "live",
    strength: p.strength,
    regex: p.regex,
  }))

  compiledEntries = [...hardEntries, ...softEntries, ...structuralEntries]
  return compiledEntries
}

const LIFECYCLE_WEIGHT: Record<Lifecycle, number> = {
  red_herring: 0.2,
  fading: 0.5,
  live: 1,
  hard_evidence: 1,
}

/** Yellow-tier (context-dependent) matches only count once they occur 2+ times. */
const YELLOW_OVERUSE_THRESHOLD = 2

/** First occurrence counts fully; each repeat beyond that adds half weight,
 * capped at 4 extra repeats, so one term repeated 50 times can't dominate. */
function repetitionWeight(count: number): number {
  return 1 + Math.min(count - 1, 4) * 0.5
}

/** Density (strength-weighted matches per 1000 words) at which the score
 * saturates to 50/100. */
const DENSITY_MIDPOINT = 100

/** Words added to the denominator before converting to a per-1000-words
 * density. Without this, a fixed number of findings in a short piece
 * produces a much higher density than the same findings in a long one
 * purely because the divisor is small. One hard-ban word in a 300-word
 * email hit the same score as ten of them in a 3,000-word piece. Padding
 * the denominator means density approaches raw strength-per-1000-words
 * only once a piece is well past typical email/message length, so a couple
 * of isolated findings in a short piece read as a mild tell instead of a
 * verdict. */
const DENSITY_SMOOTHING_WORDS = 1500

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function confidenceToSeverity(confidence: Confidence): Finding["severity"] {
  if (confidence === "red") return "high"
  if (confidence === "orange") return "medium"
  return "low"
}

function tierForScore(score: number): Tier {
  if (score < 15) return "green"
  if (score < 35) return "yellow"
  if (score < 55) return "orange"
  return "red"
}

const TIER_SUMMARY: Record<Tier, string> = {
  green: "No tells from this pass, but that's not a certificate. It means nothing in this corpus matched, not that a careful reader would call it human.",
  yellow: "Mostly clean. A tell or two, not enough density to read as templated.",
  orange: "Some tells. Enough recognizable AI-style patterns that a careful reader would notice.",
  red: "Heavy AI styling. Multiple strong tells stacking up, worth a structural rewrite, not a word-swap pass.",
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase()
}

/** Compiles the user's extra banned words into entries shaped like corpus
 * entries, minus anything also present in allowedWords (allow wins on a
 * literal conflict: an explicit "stop flagging this" beats an explicit
 * "always flag this"). */
function compileCustomBannedEntries(extraBannedWords: string[], allowedSet: Set<string>): CompiledEntry[] {
  const seen = new Set<string>()
  const entries: CompiledEntry[] = []
  for (const raw of extraBannedWords) {
    const term = raw.trim()
    if (!term) continue
    const key = normalizeWord(term)
    if (seen.has(key) || allowedSet.has(key)) continue
    seen.add(key)
    entries.push({
      term,
      category: "custom",
      subcategory: "user-banned",
      confidence: "red",
      lifecycle: "live",
      strength: HARD_BAN_STRENGTH,
      regex: compilePhrase(term),
    })
  }
  return entries
}

/**
 * Audit a piece of non-fiction prose for AI writing tells: banned/soft-flag
 * vocabulary, structural regex patterns (contrastive negation, formulaic
 * openers, citation-markup leaks, etc.), and whole-piece rhythm (uniform
 * paragraph length, flat sentence-length "burstiness"). `options` layers a
 * user's own dictionary (src/engine/dictionaryStore.ts) on top of the
 * built-in corpus: extraBannedWords add hard-ban entries, allowedWords
 * suppress any entry (built-in, structural, or custom) with a matching term.
 *
 * Pure function, no network/LLM calls, deterministic given the same text,
 * data files, and options.
 */
export function auditText(text: string, options: AuditOptions = {}): AuditResult {
  const wordCount = countWords(text)

  if (!wordCount) {
    return {
      score: 0,
      tier: "green",
      wordCount: 0,
      findings: [],
      categoryBreakdown: [],
      summary: "Empty input.",
      strengths: { specificityPer1000Words: 0, concreteAbstractRatio: 0, sentenceBurstiness: 0, notes: [] },
    }
  }

  const allowedSet = new Set((options.allowedWords ?? []).map(normalizeWord).filter(Boolean))
  const suppressedIds = new Set(
    options.register ? (REGISTER_DETECTOR_SUPPRESSIONS[options.register] ?? []) : []
  )
  const baseEntries = getCompiledEntries().filter(
    (e) => !allowedSet.has(normalizeWord(e.term)) && !(e.id && suppressedIds.has(e.id))
  )
  // Skip a custom-banned entry if the corpus already bans the same term;
  // it'd otherwise double-report the same match under two categories.
  const baseTerms = new Set(baseEntries.map((e) => normalizeWord(e.term)))
  const customEntries = compileCustomBannedEntries(options.extraBannedWords ?? [], allowedSet).filter(
    (e) => !baseTerms.has(normalizeWord(e.term))
  )
  const entries = [...baseEntries, ...customEntries]
  const findings: Finding[] = []

  for (const entry of entries) {
    entry.regex.lastIndex = 0
    const matches: FindingMatch[] = []
    let m: RegExpExecArray | null
    while ((m = entry.regex.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length })
      if (m[0].length === 0) entry.regex.lastIndex++
    }
    if (matches.length > 0) {
      const scored = entry.confidence !== "yellow" || matches.length >= YELLOW_OVERUSE_THRESHOLD
      findings.push({
        term: entry.term,
        category: entry.category,
        subcategory: entry.subcategory,
        confidence: entry.confidence,
        severity: confidenceToSeverity(entry.confidence),
        count: matches.length,
        scored,
        matches,
        replacementHint: entry.replacementHint,
        note: entry.note,
      })
    }
  }

  const entryByTerm = new Map<string, CompiledEntry>()
  for (const e of entries) {
    if (!entryByTerm.has(e.term)) entryByTerm.set(e.term, e)
  }
  const weightedSum = findings
    .filter((f) => f.scored)
    .reduce((sum, f) => {
      const entry = entryByTerm.get(f.term)!
      return sum + entry.strength * repetitionWeight(f.count) * LIFECYCLE_WEIGHT[entry.lifecycle]
    }, 0)

  const density = weightedSum / ((wordCount + DENSITY_SMOOTHING_WORDS) / 1000)
  const score = weightedSum > 0 ? Math.round((100 * density) / (density + DENSITY_MIDPOINT)) : 0

  const rhythmFindings = detectWholePieceRhythm(text)
  // Whole-piece rhythm issues nudge the score up modestly (they're a real
  // signal but shouldn't dominate the way a dozen banned words would).
  const rhythmBonus = rhythmFindings.length * 6
  const finalScore = Math.min(100, score + rhythmBonus)

  for (const rf of rhythmFindings) {
    findings.push({
      term: rf.name,
      category: "Whole-piece rhythm",
      subcategory: rf.id,
      confidence: "orange",
      severity: rf.severity,
      count: 1,
      scored: true,
      note: rf.detail,
    })
  }

  findings.sort((a, b) => Number(b.scored) - Number(a.scored) || b.count - a.count)

  const byCategory = new Map<string, number>()
  for (const f of findings) {
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + f.count)
  }
  const categoryBreakdown = Array.from(byCategory.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const tier = tierForScore(finalScore)

  return {
    score: finalScore,
    tier,
    wordCount,
    findings,
    categoryBreakdown,
    summary: TIER_SUMMARY[tier],
    strengths: computeStrengthSignals(text),
  }
}
