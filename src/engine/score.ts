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

/** Dictionary terms that measurably fire *more* on real human writing than
 * on AI writing in a given register, so scoring them there drags human text
 * toward "flagged" and AI text toward "clean", the opposite of intent.
 * Ordinary formal-register vocabulary in long-form reference documentation
 * ("framework", "validate", "in order to"...), not an AI tell in that genre.
 * Confirmed by an assay efficacy run (see ../assay) against a labeled
 * pre-2021 human-docs corpus vs. two AI-effort tiers: each of these terms
 * showed negativeRate > positiveRate (inverted lift) at register "docs".
 * Suppressed rather than sign-flipped: the inversion is measured on a small
 * corpus (29 negative / 50 positive docs), so trusting its direction is
 * safer than trusting its magnitude. Revisit as the eval corpus grows. */
const REGISTER_TERM_SUPPRESSIONS: Partial<Record<Register, string[]>> = {
  docs: ["in order to", "when it comes to", "significant", "propagate", "domain", "expedite", "framework", "validate"],
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

/** Only single alphabetic-word terms get auto-inflected: multi-word phrases
 * ("at its core") and hyphenated compounds ("cutting-edge") have no regular
 * inflection to generate, and a phrase-level regex already anchors on the
 * whole span. */
const INFLECTABLE_TERM_RE = /^[A-Za-z]{3,}$/

/** Coarse, deliberately approximate suffix rules (no CVC consonant-doubling,
 * no irregular verbs): good enough to catch "framework"/"frameworks" and
 * "robust"/"robustly" without a real morphological dictionary. Overgenerated
 * forms that aren't real English (e.g. "robusted") are harmless: they just
 * never match anything in real text. */
function inflectForms(term: string): string[] {
  const t = term.toLowerCase()
  const endsInSilentE = /[^e]e$/.test(t) || t === "e"
  const endsInConsonantY = /[^aeiou]y$/.test(t)
  const forms = new Set<string>()

  // -s / -es (plural noun or 3rd-person verb)
  if (/(?:[sxz]|[cs]h)$/.test(t)) forms.add(`${t}es`)
  else if (endsInConsonantY) forms.add(`${t.slice(0, -1)}ies`)
  else forms.add(`${t}s`)

  // -ed (past tense)
  if (endsInSilentE) forms.add(`${t}d`)
  else if (endsInConsonantY) forms.add(`${t.slice(0, -1)}ied`)
  else forms.add(`${t}ed`)

  // -ing (gerund)
  if (endsInSilentE) forms.add(`${t.slice(0, -1)}ing`)
  else forms.add(`${t}ing`)

  // -ly (adverb)
  if (/le$/.test(t)) forms.add(`${t.slice(0, -2)}ly`)
  else if (endsInConsonantY) forms.add(`${t.slice(0, -1)}ily`)
  else forms.add(`${t}ly`)

  forms.delete(t)
  return [...forms]
}

/** Compiles a corpus term into a regex that also matches its inflected
 * forms, unless a generated form collides with a term that already has its
 * own explicit corpus entry (e.g. "dive" auto-generates "diving", but
 * "diving" is already its own entry with its own note/severity, so it's
 * excluded here to avoid double-counting the same match as two findings). */
function compileTermPattern(term: string, explicitTerms: Set<string>): RegExp {
  if (!INFLECTABLE_TERM_RE.test(term)) return compilePhrase(term)
  const base = term.toLowerCase()
  const forms = inflectForms(base).filter((f) => !explicitTerms.has(f))
  if (forms.length === 0) return compilePhrase(term)
  const alternation = [term, ...forms].map(escapeRegExp).join("|")
  return new RegExp(`\\b(?:${alternation})\\b`, "gi")
}

// Hard-ban terms are always "red" confidence (flag on sight); soft-flag terms
// are "orange" (flag in clusters / surface as a question, never auto-cut).
const HARD_BAN_STRENGTH = 80
const SOFT_FLAG_STRENGTH = 45

let compiledEntries: CompiledEntry[] | null = null

function getCompiledEntries(): CompiledEntry[] {
  if (compiledEntries) return compiledEntries

  // Terms already explicit in either corpus (e.g. "diving" alongside "dive")
  // are excluded from auto-inflection so a match never gets double-counted
  // as two separate findings, see compileTermPattern.
  const explicitTerms = new Set<string>([
    ...(bannedTermsData.entries as any[]).map((e) => e.term.toLowerCase()),
    ...(softFlagTermsData.entries as any[]).map((e) => e.term.toLowerCase()),
  ])

  const hardEntries: CompiledEntry[] = (bannedTermsData.entries as any[]).map((e) => ({
    term: e.term,
    category: e.category,
    subcategory: e.subcategory,
    confidence: "red",
    lifecycle: "live",
    strength: HARD_BAN_STRENGTH,
    regex: compileTermPattern(e.term, explicitTerms),
    replacementHint: e.replacement_hint,
  }))

  const softEntries: CompiledEntry[] = (softFlagTermsData.entries as any[]).map((e) => ({
    term: e.term,
    category: e.category,
    subcategory: e.subcategory,
    confidence: "orange",
    lifecycle: "live",
    strength: SOFT_FLAG_STRENGTH,
    regex: compileTermPattern(e.term, explicitTerms),
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

/** Only "red" (hard-ban) matches score on a first occurrence. "orange" and
 * "yellow" are context-dependent by design (soft-flag corpus terms and most
 * structural patterns): a single "however" or "at its core" is ordinary
 * writing, the AI-typical shape is leaning on it repeatedly. Both tiers only
 * count once they recur, matching AuditOptions' own documented promise that
 * soft-flag terms "flag in clusters... never auto-cut" on a lone hit. */
const OVERUSE_THRESHOLD = 2

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

const FENCED_CODE_BLOCK_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g
const INLINE_CODE_SPAN_RE = /`[^`\n]+`/g

/** Replaces every non-newline character in a match with a space, so the
 * blanked span keeps the original text's length and line breaks. Findings'
 * character offsets are computed against this cleaned text, and callers
 * expect those offsets to still index correctly into the original string
 * (see Finding.matches); blanking in place keeps that true instead of
 * shifting everything after a deletion would. */
function blankOut(match: string): string {
  return match.replace(/[^\n]/g, " ")
}

/** Code isn't prose: a shell command or a variable name inside a fenced or
 * inline span shouldn't be scanned for AI writing tells (a README's code
 * sample using the word "robust" as a variable name isn't the README's
 * prose voice), and shouldn't count toward word count or rhythm/strength
 * metrics either. Blanks both fenced (``` / ~~~) blocks and inline `code`
 * spans before any other analysis runs. */
function stripMarkdownCode(text: string): string {
  return text.replace(FENCED_CODE_BLOCK_RE, blankOut).replace(INLINE_CODE_SPAN_RE, blankOut)
}

/** Whether the character at `index` is the first word of a sentence (or the
 * very start of the text): walks back over whitespace and checks for a
 * preceding sentence-ending mark. */
function isSentenceStart(text: string, index: number): boolean {
  let i = index - 1
  while (i >= 0 && /\s/.test(text[i])) i--
  if (i < 0) return true
  return /[.!?]/.test(text[i])
}

/** A single-word corpus term matched in Title Case, mid-sentence, is much
 * more likely a proper noun (a product name like "Neon", a person's name)
 * than the tell the entry exists to catch, which is almost always used
 * lowercase in real AI-generated prose ("the neon glow of downtown", not
 * "Neon (the database) was configured separately"). Excluded rather than
 * flagged; ordinary sentence-initial capitalization is left alone. Only
 * applies to single-word terms: a multi-word phrase capitalized mid-sentence
 * isn't a plausible proper noun collision the same way. */
function isLikelyProperNounMatch(cleanedText: string, term: string, matchIndex: number, matchText: string): boolean {
  if (!INFLECTABLE_TERM_RE.test(term)) return false
  if (!/^[A-Z]/.test(matchText)) return false
  return !isSentenceStart(cleanedText, matchIndex)
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

const TIER_ORDER: Tier[] = ["green", "yellow", "orange", "red"]

function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier)
}

// Strengths used to be pure information: computed, returned, never fed back
// into the score. That meant a piece could be dense with named specifics and
// real sentence-rhythm variation and still land in orange/red purely because
// a few soft tells matched, with nothing on the other side of the ledger
// able to push back. These thresholds mirror computeStrengthSignals' own
// bar for when a signal is worth a note (structural-detectors.ts); the same
// bar decides whether it's strong enough to cap the tier here.
const STRONG_SPECIFICITY_PER_1000_WORDS = 15
const STRONG_CONCRETE_ABSTRACT_RATIO = 2
const STRONG_SENTENCE_BURSTINESS = 0.5

/** At least this many of the three strength signals have to clear their bar
 * before they're trusted to cap the tier: one strong signal alone could be a
 * fluke (a piece with three phone numbers and nothing else grounded isn't
 * actually specific writing), but two independent ones agreeing is a real
 * pattern. */
const STRONG_SIGNALS_TO_CAP_TIER = 2

/** The ceiling a strong strengths signal can hold the tier to. Specific,
 * grounded, rhythmically varied writing can still read as mildly templated
 * (yellow) if it also picks up a tell or two, but soft tells alone shouldn't
 * be able to push it past that into orange/red the way they would a generic,
 * ungrounded piece. */
const STRENGTH_TIER_CAP: Tier = "yellow"

function strengthsCapTier(strengths: StrengthSignals): boolean {
  const strongSignalCount =
    (strengths.specificityPer1000Words >= STRONG_SPECIFICITY_PER_1000_WORDS ? 1 : 0) +
    (strengths.concreteAbstractRatio >= STRONG_CONCRETE_ABSTRACT_RATIO ? 1 : 0) +
    (strengths.sentenceBurstiness >= STRONG_SENTENCE_BURSTINESS ? 1 : 0)
  return strongSignalCount >= STRONG_SIGNALS_TO_CAP_TIER
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
  // Blanked in place (not deleted), so it stays the same length as `text`:
  // every offset computed below is still a valid index into the original
  // string, see blankOut.
  const cleanedText = stripMarkdownCode(text)
  const wordCount = countWords(cleanedText)

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
  const suppressedTerms = new Set(
    (options.register ? (REGISTER_TERM_SUPPRESSIONS[options.register] ?? []) : []).map(normalizeWord)
  )
  const baseEntries = getCompiledEntries().filter(
    (e) =>
      !allowedSet.has(normalizeWord(e.term)) &&
      !(e.id && suppressedIds.has(e.id)) &&
      !suppressedTerms.has(normalizeWord(e.term))
  )
  // A user's explicit ban is always a hard ban (see compileCustomBannedEntries),
  // which only changes behavior over the built-in corpus entry for the same
  // term if that entry isn't already "red": an already-red duplicate is
  // dropped (same treatment either way, no point double-reporting), but a
  // duplicate of a softer orange/yellow corpus entry means the built-in
  // entry is dropped instead, so the user's "always flag this" intent isn't
  // silently downgraded to the corpus entry's cluster-only treatment.
  const baseByTerm = new Map(baseEntries.map((e) => [normalizeWord(e.term), e]))
  const customEntries = compileCustomBannedEntries(options.extraBannedWords ?? [], allowedSet).filter(
    (e) => baseByTerm.get(normalizeWord(e.term))?.confidence !== "red"
  )
  const upgradedTerms = new Set(customEntries.map((e) => normalizeWord(e.term)))
  const entries = [...baseEntries.filter((e) => !upgradedTerms.has(normalizeWord(e.term))), ...customEntries]
  const findings: Finding[] = []

  for (const entry of entries) {
    entry.regex.lastIndex = 0
    const matches: FindingMatch[] = []
    let m: RegExpExecArray | null
    while ((m = entry.regex.exec(cleanedText)) !== null) {
      if (!isLikelyProperNounMatch(cleanedText, entry.term, m.index, m[0])) {
        matches.push({ start: m.index, end: m.index + m[0].length })
      }
      if (m[0].length === 0) entry.regex.lastIndex++
    }
    if (matches.length > 0) {
      const scored = entry.confidence === "red" || matches.length >= OVERUSE_THRESHOLD
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

  const rhythmFindings = detectWholePieceRhythm(cleanedText, options.register)
  // Whole-piece rhythm findings get real weight, not a token nudge: once
  // register-calibrated (see REGISTER_MECHANICAL_BASELINES in
  // structural-detectors.ts), they turned out to be the best-populated,
  // best-separating signal this engine has for long-form registers: an
  // assay efficacy run against a labeled docs corpus moved pooled AUC from
  // 0.489 (chance) to 0.725 going from a per-finding weight of 6 to 14.
  // Picked 14 over higher values that scored marginally better (up to 0.79
  // at weight 18) because that gain came from a rising false-positive rate,
  // not broader separation, a sign of tuning to this one small corpus
  // rather than the underlying signal. Re-tune against a larger corpus
  // before pushing this further.
  const rhythmBonus = rhythmFindings.length * 14
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

  let tier = tierForScore(finalScore)
  const strengths = computeStrengthSignals(cleanedText)

  // A hard_evidence finding (a chatbot citation leak, a cutoff-date
  // disclaimer, an unfilled template placeholder) is unambiguous: no amount
  // of specificity elsewhere in the piece makes an actual assistant artifact
  // not an assistant artifact, so the cap never applies when one's present.
  const hardEvidenceTerms = new Set(
    entries.filter((e) => e.lifecycle === "hard_evidence").map((e) => e.term)
  )
  const hasHardEvidenceFinding = findings.some((f) => f.scored && hardEvidenceTerms.has(f.term))
  if (!hasHardEvidenceFinding && strengthsCapTier(strengths) && tierRank(tier) > tierRank(STRENGTH_TIER_CAP)) {
    tier = STRENGTH_TIER_CAP
  }

  return {
    score: finalScore,
    tier,
    wordCount,
    findings,
    categoryBreakdown,
    summary: TIER_SUMMARY[tier],
    strengths,
  }
}
