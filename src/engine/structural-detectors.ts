/**
 * Structural AI-tell detectors: regex-based patterns that catch template
 * shapes (not just individual banned words). Standalone port, adapted from
 * JP LeBlanc's AIStoryHub (lib/corpus/structural-patterns.ts) for this
 * sibling non-fiction connector project. See src/data/SOURCES.md.
 *
 * Fiction-specific patterns (character-intro formulas, dialogue tags) are
 * dropped: this connector is non-fiction only.
 */

import { computeTextStats } from "./textStats.js"

export type Confidence = "red" | "orange" | "yellow"

/** Tell lifecycle: is this pattern still a live signal on current-model output?
 * Omit to mean "live" (the common case). */
export type Lifecycle = "hard_evidence" | "live" | "fading" | "red_herring"

export interface StructuralPattern {
  id: string
  term: string
  category: string
  subcategory: string
  confidence: Confidence
  strength: number
  lifecycle?: Lifecycle
  regex: RegExp
}

export const STRUCTURAL_PATTERNS: StructuralPattern[] = [
  {
    id: "no-triple",
    term: "No X. No Y. No Z.",
    category: "Sentence patterns",
    subcategory: "Staccato triple negative",
    confidence: "red",
    strength: 75,
    regex: /\bNo\s+(?!,)[^.!?\n,]{1,20}\.\s+No\s+(?!,)[^.!?\n,]{1,20}\.\s+No\s+(?!,)[^.!?\n,]{1,20}\./gi,
  },
  {
    id: "all-none",
    term: "All the X. None of the Y.",
    category: "Sentence patterns",
    subcategory: "Choppy fragment pair",
    confidence: "red",
    strength: 75,
    regex: /\bAll the\s+[^.!?\n]{1,30}?\.\s+None of the\s+[^.!?\n]{1,30}?\./gi,
  },
  {
    id: "negative-listing",
    term: "Not a X... Not a Y... A Z.",
    category: "Sentence patterns",
    subcategory: "Negative listing",
    confidence: "red",
    strength: 75,
    // A rhetorical striptease: listing what something is *not*, twice, before
    // revealing what it *is*. Present-tense ("Not a X... Not a Y... A Z.")
    // and past-tense ("It wasn't X. It wasn't Y. It was Z.") are the same
    // template; matched as two branches rather than trying to unify the verb
    // forms into one pattern.
    regex:
      /\bNot\s+(?:a|an)\s+[^.!?\n,]{1,30}\.\s+Not\s+(?:a|an)\s+[^.!?\n,]{1,30}\.\s+(?:A|An)\s+[^.!?\n,]{1,30}\.|\bIt\s+wasn'?t\s+[^.!?\n,]{1,30}\.\s+It\s+wasn'?t\s+[^.!?\n,]{1,30}\.\s+It\s+was\s+[^.!?\n,]{1,30}\./gi,
  },
  {
    id: "elevation-echo",
    term: "It's not just X, it's Y",
    category: "Sentence patterns",
    subcategory: "Contrastive negation",
    confidence: "red",
    strength: 75,
    // Three branches: the classic "not just/only" form (both "is not" and
    // the "isn't" contraction), plus a "None of this is X" opener: that
    // framing carries the same elevate-and-reframe move without needing
    // "just/only" as a lexical trigger (e.g. "None of this is about cutting
    // corners. It's about cutting the waiting."). A bare "it's not X. It's
    // Y." is deliberately left unmatched: without "just/only" or a "none
    // of" opener it's as likely a plain correction as an elevation, and
    // matching it would flag ordinary two-sentence prose.
    regex:
      /\b(?:(?:it'?s|this is|that'?s)\s+not\s+(?:just|only)\b|(?:it|this|that)\s+isn'?t\s+(?:just|only)\b|none of (?:this|that|it)\s+(?:is|was)\b)[^.!?\n]{1,60}?[.,]?\s*(?:it'?s|this is|that'?s)\b/gi,
  },
  {
    id: "stop-start",
    term: "Stop doing X. Start doing Y.",
    category: "Sentence patterns",
    subcategory: "Imperative-then-payoff",
    confidence: "red",
    strength: 75,
    regex: /\bStop\s+[^.!?\n]{1,30}?\.\s+Start\s+[^.!?\n]{1,30}?\./gi,
  },
  {
    id: "not-only-but-also",
    term: "not only X but also Y",
    category: "Sentence patterns",
    subcategory: "Negative parallelism",
    confidence: "red",
    strength: 75,
    regex: /\bnot only\b[^.!?\n]{1,60}?\bbut also\b/gi,
  },
  {
    id: "at-its-core",
    term: "at its core",
    category: "Rhetorical & structural moves",
    subcategory: "Definition-first framing",
    confidence: "orange",
    strength: 50,
    regex: /\bat its core\b/gi,
  },
  {
    id: "more-you-less-you",
    term: "The more you X, the less you Y",
    category: "Sentence patterns",
    subcategory: "Parallel comparative",
    confidence: "orange",
    strength: 50,
    regex: /\bthe more you\s+[^.!?\n]{1,30}?,\s*the less you\b/gi,
  },
  {
    id: "thats-where-comes-in",
    term: "That's where X comes in",
    category: "Sentence patterns",
    subcategory: "Pivot phrase",
    confidence: "orange",
    strength: 50,
    regex: /\bthat'?s where\s+[^.!?\n]{1,40}?\bcomes in\b/gi,
  },
  {
    id: "not-all-created-equal",
    term: "Not all X are created equal",
    category: "Sentence patterns",
    subcategory: "Aphorism riff",
    confidence: "orange",
    strength: 50,
    regex: /\bnot all\s+[^.!?\n]{1,30}?\bare created equal\b/gi,
  },
  {
    id: "most-people-believe-wrong",
    term: "Most people believe X. They're wrong.",
    category: "Sentence patterns",
    subcategory: "Strawman-then-debunk",
    confidence: "orange",
    strength: 50,
    regex: /\bMost people (?:believe|think)\s+[^.!?\n]{1,40}?\.\s+They'?re wrong\b/gi,
  },
  {
    id: "studies-show-percent",
    term: "Studies show that X% of...",
    category: "Sentence patterns",
    subcategory: "Fabricated statistic framing",
    confidence: "orange",
    strength: 50,
    regex: /\bstudies show that\s+\d{1,3}%/gi,
  },
  {
    id: "vague-authority-attribution",
    term: 'Vague authority attribution ("industry experts say", "research shows", "observers note")',
    category: "Rhetorical & structural moves",
    subcategory: "Vague authority attribution",
    confidence: "orange",
    strength: 55,
    // "experts suggest"/"experts argue" are covered as literal banned-terms
    // phrases already; this pattern picks up the surrounding shape instead
    // (say/agree/note/believe, plus research/studies/reports show/indicate/
    // reveal, plus "observers note") so the two don't double-count the same
    // span. Name the source or own the claim: that's the whole tell.
    regex:
      /\b(?:industry\s+)?experts\s+(?:say|agree|note|believe)\b|\b(?:research|studies|reports?)\s+(?:show|shows|indicates?|reveals?)\b|\bobservers\s+note\b/gi,
  },
  {
    id: "participial-tail-abstract",
    term: "Participial padding (-ing tails restating the sentence)",
    category: "Sentence patterns",
    subcategory: "Participial padding",
    confidence: "orange",
    strength: 50,
    // Anchored to abstract restatement verbs only. A bare gerund-clause
    // regex would flag huge amounts of ordinary prose ("she stood there,
    // waiting"). This narrower form is the AI-specific tell: a trailing
    // clause that re-announces the sentence's point rather than adding one.
    regex:
      /,\s+(?:underscoring|highlighting|emphasizing|emphasising|reinforcing|reflecting|signaling|signalling|showcasing|illustrating|demonstrating)\s+[^.!?\n]{1,60}[.!?]/gi,
  },
  {
    id: "em-dash-rate",
    term: "Em-dash overuse",
    category: "Formatting tells",
    subcategory: "Formatting tells",
    confidence: "orange",
    strength: 50,
    // Down-weighted: newer models use FEWER em dashes than human essayists,
    // so raw presence no longer separates AI from human on its own. Kept as
    // a weak supporting signal and for dating older text.
    lifecycle: "red_herring",
    regex: /—|(?<=\s)--(?=\s|$)|(?<=^|\s)--(?=\s)/gm,
  },
  {
    id: "title-case-header",
    term: "Title Case In Every Section Heading",
    category: "Formatting tells",
    subcategory: "Formatting tells",
    confidence: "yellow",
    strength: 30,
    regex: /^([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|and|or|of|the|in|for|to|a|an))+\s+[A-Z][a-z]+)\s*$/gm,
  },
  {
    id: "ai-utm-source",
    term: "utm_source=chatgpt.com in cited URLs",
    category: "Formatting tells",
    subcategory: "Formatting tells",
    confidence: "red",
    strength: 95,
    lifecycle: "hard_evidence",
    regex:
      /[?&]utm_source=(?:chatgpt|openai|copilot|claude|grok|gemini|perplexity)(?:\.com|\.ai)?\b|[?&]referrer=(?:chatgpt|copilot|grok|claude|gemini|perplexity)\.(?:com|ai)\b/gi,
  },
  {
    id: "ai-citation-markup",
    term: "Chatbot citation markup leak (citeturn/oai_citation/grok_card)",
    category: "Channel-specific & assistant tells",
    subcategory: "Assistant / chatbot boilerplate",
    confidence: "red",
    strength: 95,
    lifecycle: "hard_evidence",
    regex:
      /\bcite(?:turn|news|search|navigation)\d+(?:search|turn|news|navigation)\d+|contentReference\s*\[oaicite:[^\]]+\]\s*\{[^}]*\}|\boai_citation\b|\[attached_file:\d+\]|\bgrok_card\b/gi,
  },
  {
    id: "cutoff-disclaimer",
    term:
      'AI self-disclosure & cutoff-date hedge ("as of my last update", "I don\'t have access to real-time data")',
    category: "Channel-specific & assistant tells",
    subcategory: "Assistant / chatbot boilerplate",
    confidence: "red",
    strength: 85,
    lifecycle: "hard_evidence",
    regex:
      /\bas\s+of\s+my\s+last\s+update\b|\bas\s+of\s+my\s+(?:knowledge\s+)?(?:cut-?off|last\s+training)\b|\bi\s+don'?t\s+have\s+access\s+to\s+real-?time\s+(?:data|information)\b|\bbased\s+on\s+available\s+information\b|\bas\s+an?\s+(?:ai|artificial\s+intelligence|large\s+language|ai\s+language)\s+(?:language\s+)?model\b|\bi\s+(?:am|'m)\s+an?\s+(?:ai|artificial\s+intelligence|large\s+language)\s+(?:assistant|model)?\b|\bi\s+cannot\s+(?:provide|give|offer)\s+(?:legal|medical|financial|professional)\s+advice\b|\bmy\s+training\s+data\s+(?:only\s+)?(?:goes\s+up\s+to|extends\s+to|ends\s+(?:in|at))\b/gi,
  },
  {
    id: "ai-placeholder",
    term: "Unfilled template placeholder ([Your Name], [INSERT X], TODO/TBD stub)",
    category: "Formatting tells",
    subcategory: "Formatting tells",
    confidence: "orange",
    strength: 70,
    lifecycle: "hard_evidence",
    regex:
      /\[(?:Your|Insert|Add|Enter|Describe|Specify|Choose|Pick)[^\]\n]{1,80}\]|\[(?:Recipient|Sender|Topic|Subject|Salutation|Closing|Position|Department|Project Name|Company Name|Date)(?:\s+[^\]\n]{0,60})?\]|\[(?:INSERT|FILL\s+IN|ADD|TODO|TBD|PLACEHOLDER)[^\]\n]{0,80}\]|\b(?:19|20)\d{2}-XX-XX\b|\bXX\/XX\/(?:19|20)\d{2}\b|<!--\s*(?:add|fill\s+in|insert|todo|placeholder)[^>]{0,120}-->/gi,
  },
  {
    id: "formulaic-opener",
    term: 'Formulaic essay opener ("in the rapidly evolving landscape of X", "has emerged as a key X")',
    category: "Sentence patterns",
    subcategory: "Hook / opener formulas",
    confidence: "orange",
    strength: 65,
    regex:
      /\bin\s+the\s+(?:rapidly\s+|ever-?\s*)?(?:evolving|changing|expanding|growing|shifting)\s+(?:world|landscape|realm|space|field|domain|era)\s+of\b|\bin\s+(?:an?|the)\s+(?:digital\s+)?age\s+(?:where|of)\b|\bas\s+(?:we|the\s+world|society|industries?)\s+(?:continue|move|navigate|enter)\s+(?:to\s+)?(?:evolve|forward|into|through)\b|\bhas\s+emerged\s+as\s+(?:a|the|one\s+of)\s+(?:leading|key|major|critical|essential|fundamental|pivotal|prominent|dominant|important)\s+\w+|\bhas\s+become\s+increasingly\s+(?:important|critical|popular|relevant|prominent|essential)\b/gi,
  },
  {
    id: "to-name-a-few",
    term: '"Name" used as a verb to close a list ("to name a few", "to name just two")',
    category: "Words & phrases",
    subcategory: "List-closer cliché",
    confidence: "orange",
    strength: 55,
    // "Name" as a noun (a person's name, a brand name) is untouched; only
    // the verb-form list-closer idiom is the tell.
    regex: /\bto name (?:but |just )?(?:a few|only \w+|one|two|three|several)\b/gi,
  },
  {
    id: "hedge-stack",
    term: 'Hedge-stacked prediction ("could potentially", "might eventually")',
    category: "Words & phrases",
    subcategory: "Hedges & qualifiers",
    confidence: "orange",
    strength: 55,
    // Modal + hedge adverb stacked; either word alone is fine, the stack is the tell.
    regex:
      /\b(?:could|may|might)\s+(?:\w+\s+){0,2}(?:potentially|eventually|ultimately|possibly|conceivably)\b|\b(?:potentially|eventually|ultimately)\s+(?:could|may|might)\b/gi,
  },
  {
    id: "bulleted-bold-term",
    term: "Bolded-term bullet (**Term:** restated definition)",
    category: "Formatting tells",
    subcategory: "Formatting tells",
    confidence: "red",
    strength: 70,
    regex: /^[ \t]*[-*•]\s*\*\*[^*\n]{1,60}\*\*:?/gm,
  },
  {
    id: "markdown-heading-leak",
    term: "Raw Markdown heading syntax pasted into non-Markdown text",
    category: "Formatting tells",
    subcategory: "Formatting tells",
    confidence: "red",
    strength: 65,
    regex: /^#{1,6}\s+\S.*$/gm,
  },
  {
    id: "markdown-bold-in-prose",
    term: "Markdown bold syntax surviving into running prose",
    category: "Formatting tells",
    subcategory: "Formatting tells",
    confidence: "orange",
    strength: 45,
    regex: /\*\*[^*\n]{2,60}\*\*/g,
  },
  {
    id: "emoji-bullet-scaffolding",
    term: "Emoji used as structural bullet scaffolding",
    category: "Formatting tells",
    subcategory: "Formatting tells",
    confidence: "orange",
    strength: 55,
    regex: /^[ \t]*(?:\u{1F680}|\u{1F4A1}|✅|❌|\u{1F511}|\u{1F4C8}|⚡|\u{1F525}|\u{1F449}|\u{1F4CC}|\u{1F3AF}|\u{1F389}|✨)\s/gmu,
  },
  {
    id: "category-contrast-positioning",
    term: "Most X do A. This one does B.",
    category: "Sentence patterns",
    subcategory: "Engineered category contrast",
    confidence: "orange",
    strength: 55,
    // A positioning move, not a strawman-then-debunk (that's
    // most-people-believe-wrong): the first clause isn't called wrong, it's
    // just generic, and the second clause claims the specific subject does
    // something sharper. Requires "this" to refer back to a countable noun
    // ("one"/"tool"/etc.), not a bare demonstrative, to avoid flagging
    // ordinary two-sentence contrasts.
    regex:
      /\b(?:Most|Many)\s+[^.!?\n]{1,80}?\.\s+This\s+(?:one|tool|approach|product|version|library|model)\b[^.!?\n]{1,80}?\./gi,
  },
  {
    // D1 pattern family C (narrated intent), see
    // etincel-human-signal-spec.md Part 2. Families A and B need paragraph
    // context (a standalone-paragraph gate, a paragraph-initial count), so
    // they live in detectWholePieceRhythm below instead; this one is a
    // plain phrase match like the rest of this list.
    id: "narrated-intent-scaffold",
    term: 'Narrated intent ("let me walk you through", "I\'ll break this down")',
    category: "Rhetorical & structural moves",
    subcategory: "Self-describing structure",
    confidence: "orange",
    strength: 55,
    regex: /\b(?:let me|I(?:'ll| will))\s+(?:walk you through|break (?:this|it) down|cover|outline|unpack)\b/gi,
  },
  {
    id: "parenthetical-hedge",
    term: 'Parenthetical hedging aside ("(and increasingly, X)", "(though to be fair, Z)")',
    category: "Sentence patterns",
    subcategory: "Sentence patterns",
    confidence: "yellow",
    strength: 40,
    regex:
      /\(\s*(?:and\s+)?(?:increasingly|notably|importantly|crucially|interestingly|perhaps)[,]?\s+[^)]{3,60}\)|\(\s*or\s+more\s+(?:precisely|accurately|specifically)[,]?\s+[^)]{3,60}\)|\(\s*though\s+to\s+be\s+fair[,]?\s+[^)]{3,60}\)|\(\s*at\s+least\s+(?:in\s+)?(?:theory|principle|part)[,]?\s+[^)]{0,60}\)/gi,
  },
]

// ---------------------------------------------------------------------------
// Whole-piece heuristics that don't reduce to a single regex: paragraph and
// sentence shape metrics. These feed the "structural" side of the score even
// though no single span is "the" match.

export interface WholePieceMetrics {
  paragraphCount: number
  paragraphLengthsSentences: number[]
  /** Coefficient of variation of paragraph length in sentences (std / mean).
   * Low values mean suspiciously uniform paragraphs. */
  paragraphLengthUniformity: number
  sentenceCount: number
  sentenceLengthsWords: number[]
  /** Coefficient of variation of sentence length in words ("burstiness").
   * Low values mean flat, AI-typical sentence rhythm. */
  sentenceBurstiness: number
  avgSentenceLength: number
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function splitSentences(paragraph: string): string[] {
  return paragraph
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1 // not enough data to call it uniform
  const m = mean(values)
  if (m === 0) return 0
  const variance = mean(values.map((v) => (v - m) ** 2))
  return Math.sqrt(variance) / m
}

interface MechanicalBaseline {
  mean: number
  stdev: number
}

/** Per-register expected mean/stdev for four mechanical stats, so whole-piece
 * rhythm detection compares a piece against what's normal for *this kind of
 * writing* instead of one fixed number for every register. Without this, the
 * generic 0.35 CV cutoff below almost never fires on long-form reference
 * documentation: real docs prose (human or AI) typically runs CV 0.5-0.8, so
 * a threshold tuned for punchier short-form copy sits under where either
 * class lives and stays silent on both.
 *
 * "docs" is calibrated from 191 pre-2021 documentation pages pulled from six
 * OSS projects (kubernetes/website, rust-lang/rust, postgres, curl, vuejs/docs,
 * npm/cli) via a script mirroring assay's corpora/build-human-corpus.mjs,
 * deliberately drawn from different repos than assay's own held-out human
 * corpus (django/flask/express/rails/git/node/peps) so the baseline isn't
 * fit to the same documents an AUC run later scores. structuralEntropy's
 * direction here is the opposite of the "high entropy reads human" framing
 * used for voice-matching a specific trained writer elsewhere in this file's
 * comments (see textStats.ts's describeEntropy), a different task (match
 * one person's rhythm) with a different empirical direction than this one
 * (separate AI docs from human docs on average), not a contradiction.
 * Other registers have no ground truth yet and fall back to the generic
 * threshold; extend this map before trusting drift detection anywhere else. */
const REGISTER_MECHANICAL_BASELINES: Record<string, {
  sentenceLengthCV: MechanicalBaseline
  paragraphLengthCV: MechanicalBaseline
  fragmentRate: MechanicalBaseline
  structuralEntropy: MechanicalBaseline
}> = {
  docs: {
    sentenceLengthCV: { mean: 0.666, stdev: 0.189 },
    paragraphLengthCV: { mean: 0.719, stdev: 0.329 },
    fragmentRate: { mean: 0.069, stdev: 0.068 },
    structuralEntropy: { mean: 0.583, stdev: 0.076 },
  },
  // "blog" is calibrated from 166 pre-2021 posts on the official Go blog
  // (golang/website, permissive BSD-style license), an independent source
  // from the two repos (rust-lang/blog.rust-lang.org, electron/electronjs.org)
  // that make up the labeled test corpus this register's suppressions and
  // weight were measured against, same reasoning as docs: calibrating and
  // testing on the same documents would be measuring the fix against the
  // data it was tuned on. fragmentRate runs meaningfully higher than docs
  // (0.115 vs 0.069) and paragraphLengthCV meaningfully lower (0.609 vs
  // 0.719): blog writing tolerates more sentence fragments and holds
  // slightly tighter paragraph rhythm than reference documentation does,
  // confirming this register needed its own numbers, not docs's borrowed.
  blog: {
    sentenceLengthCV: { mean: 0.647, stdev: 0.176 },
    paragraphLengthCV: { mean: 0.609, stdev: 0.162 },
    fragmentRate: { mean: 0.115, stdev: 0.102 },
    structuralEntropy: { mean: 0.591, stdev: 0.088 },
  },
  // "memo" is calibrated from 170 pre-2021 Node.js TSC meeting-minutes
  // documents (nodejs/TSC), independent from the two repos
  // (rust-lang/compiler-team, golang/proposal) that make up the labeled
  // test corpus this register's suppressions and weight were measured
  // against. Calibration-only use, never committed as corpus text: nodejs/TSC
  // carries no explicit LICENSE file, a bar too low for redistributing raw
  // text but fine for computing aggregate statistics that never leave this
  // comment as anything but four numbers. paragraphLengthCV runs sharply
  // higher than both docs (0.719) and blog (0.609) at 0.894: meeting-minutes
  // agenda items vary wildly in length (one line for a settled item, many
  // paragraphs for live debate) in a way neither reference docs nor blog
  // posts do. fragmentRate runs lower than blog (0.115) at 0.057, closer to
  // docs (0.069): despite the bulleted structure, memo sentences tend to be
  // complete rather than fragmentary. Confirms memo needed its own numbers,
  // not blog's or docs's borrowed.
  memo: {
    sentenceLengthCV: { mean: 0.781, stdev: 0.197 },
    paragraphLengthCV: { mean: 0.894, stdev: 0.502 },
    fragmentRate: { mean: 0.057, stdev: 0.061 },
    structuralEntropy: { mean: 0.549, stdev: 0.079 },
  },
  // "essay" is calibrated from 47 pre-2021 RFC-style proposal documents
  // (reactjs/rfcs, ember-cli/rfcs, npm/rfcs, combined for volume since no
  // single one had enough pre-cutoff documents alone), independent from the
  // two sources (rust-lang/rfcs, python/peps) that make up the labeled test
  // corpus this register's suppressions and weight were measured against.
  // Calibration-only use for ember-cli/rfcs and npm/rfcs specifically (no
  // explicit LICENSE file in either, same reasoning as memo's nodejs/TSC
  // source: too low a bar to redistribute text, fine for four aggregate
  // numbers); reactjs/rfcs carries a clear LICENSE.md. Smaller sample than
  // docs/blog/memo's ~170-190 documents, reported honestly rather than
  // padded with a weaker source. structuralEntropy runs higher than docs
  // (0.583) and blog (0.591) at 0.627: essays argue against alternatives
  // and defend trade-offs, which reads as more varied sentence-opener and
  // punctuation structure than announcement or reference prose.
  essay: {
    sentenceLengthCV: { mean: 0.668, stdev: 0.167 },
    paragraphLengthCV: { mean: 0.684, stdev: 0.224 },
    fragmentRate: { mean: 0.109, stdev: 0.079 },
    structuralEntropy: { mean: 0.627, stdev: 0.076 },
  },
  // "email" deliberately has NO entry here, unlike the other four
  // registers — tried and reverted. A baseline was calibrated from 80
  // independent pre-2021 Enron sent-mail messages (mean/stdev:
  // sentenceLengthCV 0.661/0.235, paragraphLengthCV 0.528/0.297,
  // fragmentRate 0.153/0.142, structuralEntropy 0.532/0.124 — see git
  // history for the full entry and ../assay/corpora/email/SOURCES.md for
  // the corpus), but it measurably made pooled AUC worse (0.540 -> 0.497)
  // against the labeled email test corpus, not better. Short documents
  // produce inherently noisy per-document CV estimates for both classes,
  // so a calibrated threshold ends up more lenient without discriminating
  // any better, the opposite of the other four registers' outcome. See
  // src/data/SOURCES.md's 2026-08-10 email entry for the full diagnosis:
  // this register's real problem is structural (most documents never clear
  // this engine's 8-sentence/4-paragraph whole-piece floors or its 2+
  // occurrence soft-flag floor to begin with), not a calibration-direction
  // problem the two-part fix pattern is built to solve.
}

/** How many standard deviations off a register's baseline counts as drift.
 * Chosen to sit clearly above where a held-out human sample landed (roughly
 * 0.1-0.3 stdev off baseline) and at or below where two independent AI
 * effort tiers landed (roughly 0.6-0.85 stdev off), measured against
 * assay's labeled corpus. See src/data/SOURCES.md's 2026-08-10 entry. */
const MECHANICAL_DRIFT_Z_THRESHOLD = 0.6

/** Generic CV threshold used for any register without a calibrated baseline
 * (everything except "docs" today). Unchanged from the original heuristic. */
const GENERIC_UNIFORMITY_CV_THRESHOLD = 0.35

function zScore(value: number, baseline: MechanicalBaseline): number {
  return baseline.stdev > 0 ? (value - baseline.mean) / baseline.stdev : 0
}

/** Computes whole-piece rhythm metrics used by uniform-paragraph-length and
 * low-burstiness detection. Low coefficient-of-variation values (roughly
 * below 0.35-0.4) indicate suspiciously regular rhythm. */
export function computeWholePieceMetrics(text: string): WholePieceMetrics {
  const paragraphs = splitParagraphs(text)
  const paragraphLengthsSentences = paragraphs.map((p) => splitSentences(p).length)
  const allSentences = paragraphs.flatMap((p) => splitSentences(p))
  const sentenceLengthsWords = allSentences.map((s) => s.split(/\s+/).filter(Boolean).length)

  return {
    paragraphCount: paragraphs.length,
    paragraphLengthsSentences,
    paragraphLengthUniformity: coefficientOfVariation(paragraphLengthsSentences),
    sentenceCount: allSentences.length,
    sentenceLengthsWords,
    sentenceBurstiness: coefficientOfVariation(sentenceLengthsWords),
    avgSentenceLength: mean(sentenceLengthsWords),
  }
}

export interface WholePieceFinding {
  id: string
  name: string
  severity: "high" | "medium" | "low"
  detail: string
  /** Defaults to "orange" (score.ts's finding-construction loop applies
   * that default) for the three original mechanical checks below, which
   * predate this field. D1's family A is a near-definitive tell once its
   * paragraph gate is on, so it's the first whole-piece check that needs
   * to say "red" for itself instead of inheriting the old default. */
  confidence?: Confidence
}

// ---------------------------------------------------------------------------
// D1 · self-describing-structure (etincel-human-signal-spec.md Part 2).
// Pattern families A and B need paragraph context (a standalone-paragraph
// gate, a paragraph-initial count across the whole piece), so they live
// here rather than the flat STRUCTURAL_PATTERNS list; family C is a plain
// phrase match and lives there instead.

// Family A: an enumeration announcement ("two things", "three reasons") is
// only the tell when it's *also* self/document-referential (my, I, this
// letter, below, that follow, here) AND is the entirety of a short,
// standalone paragraph. Without that gate this fires on ordinary sentences
// like "I have a few things to do today" — tested and confirmed false
// positives during spec review, which is why the gate exists at all.
const ANNOUNCED_ENUMERATION_RE =
  /\b(?:two|three|four|five|several|a few)\s+(?:things|reasons|parts|areas|ways|points|themes|threads|examples|lessons|pieces)\b/i
const SELF_OR_DOCUMENT_REFERENCE_RE = /\b(?:my|I|this letter|below|that follow|here)\b/i
const ANNOUNCED_ENUMERATION_MAX_WORDS = 25

function hasAnnouncedEnumerationParagraph(paragraphs: string[]): boolean {
  return paragraphs.some((paragraph) => {
    const sentences = splitSentences(paragraph)
    if (sentences.length !== 1) return false
    const [sentence] = sentences
    if (sentence.split(/\s+/).filter(Boolean).length > ANNOUNCED_ENUMERATION_MAX_WORDS) return false
    return ANNOUNCED_ENUMERATION_RE.test(sentence) && SELF_OR_DOCUMENT_REFERENCE_RE.test(sentence)
  })
}

// Family B: a bare ordinal opener ("First, ...") or a label-fragment slot
// ("Major gifts, first.") repeated across paragraphs is a scaffold showing
// through, not content. One instance is unremarkable prose; two or more is
// the tell, per the spec.
const ORDINAL_OPENER_RE = /^(?:first|second|third|fourth|finally|lastly)\b[,.]/i
const LABEL_FRAGMENT_RE = /^[A-Z][^.!?]{0,45},\s+(?:first|second|third|last|finally)\.$/
const ORDINAL_SCAFFOLD_MIN_PARAGRAPHS = 2

/** Both D1 families only run on pieces at or above this length, see the
 * floor's own comment at the call site in detectWholePieceRhythm. */
const SELF_DESCRIBING_STRUCTURE_MIN_WORDS = 250

function countOrdinalScaffoldParagraphs(paragraphs: string[]): number {
  // "Paragraph-initial" for the ordinal opener means testing the paragraph's
  // start (no $ anchor on that regex, so it matches regardless of what
  // follows). For the label-fragment form, whose regex is anchored at both
  // ends, that means testing it against the paragraph's opening sentence in
  // isolation, not the whole paragraph: "Major gifts, first." is D2's
  // "fragment" opener class, the first of several sentences in a 44-60 word
  // paragraph, not a one-sentence paragraph on its own.
  return paragraphs.filter((p) => {
    if (ORDINAL_OPENER_RE.test(p)) return true
    const [firstSentence] = splitSentences(p)
    return firstSentence ? LABEL_FRAGMENT_RE.test(firstSentence) : false
  }).length
}

/** Flags whole-piece rhythm problems that no single regex can catch: uniform
 * paragraph length, flat sentence-length ("low burstiness"), and, for
 * registers with a calibrated baseline (see REGISTER_MECHANICAL_BASELINES),
 * fragment rate and structural entropy drifting from what's normal for
 * that kind of writing. `register` is a plain string (not imported from
 * score.ts's Register type) to avoid a circular import; any value without an
 * entry in the baseline map just falls back to the generic threshold. */
export function detectWholePieceRhythm(text: string, register?: string): WholePieceFinding[] {
  const metrics = computeWholePieceMetrics(text)
  const baseline = register ? REGISTER_MECHANICAL_BASELINES[register] : undefined
  const findings: WholePieceFinding[] = []

  const paragraphThreshold = baseline
    ? baseline.paragraphLengthCV.mean - MECHANICAL_DRIFT_Z_THRESHOLD * baseline.paragraphLengthCV.stdev
    : GENERIC_UNIFORMITY_CV_THRESHOLD
  if (metrics.paragraphCount >= 4 && metrics.paragraphLengthUniformity < paragraphThreshold) {
    findings.push({
      id: "uniform-paragraph-length",
      name: "Uniform paragraph length",
      severity: "medium",
      detail: `${metrics.paragraphCount} paragraphs, most running about the same length with little variation between them. Vary paragraph length more.`,
    })
  }

  const sentenceThreshold = baseline
    ? baseline.sentenceLengthCV.mean - MECHANICAL_DRIFT_Z_THRESHOLD * baseline.sentenceLengthCV.stdev
    : GENERIC_UNIFORMITY_CV_THRESHOLD
  if (metrics.sentenceCount >= 8 && metrics.sentenceBurstiness < sentenceThreshold) {
    findings.push({
      id: "low-burstiness",
      name: "Low sentence-length burstiness",
      severity: "medium",
      detail: `${metrics.sentenceCount} sentences averaging ${metrics.avgSentenceLength.toFixed(0)} words, with little variation in length from one sentence to the next. Mix short sentences with long; allow fragments.`,
    })
  }

  if (baseline && metrics.sentenceCount >= 8) {
    const stats = computeTextStats(text)
    const fragmentZ = zScore(stats.fragmentRate, baseline.fragmentRate)
    const entropyZ = zScore(stats.structuralEntropy, baseline.structuralEntropy)
    // Directional: fewer fragments than this register's norm, or flatter
    // sentence-opener/punctuation variety than its norm, each independently
    // read as AI-typical smoothing in the calibration corpus (see the
    // REGISTER_MECHANICAL_BASELINES comment for the corpora and numbers).
    if (fragmentZ <= -MECHANICAL_DRIFT_Z_THRESHOLD || entropyZ >= MECHANICAL_DRIFT_Z_THRESHOLD) {
      findings.push({
        id: "mechanical-register-drift",
        name: "Rhythm/mechanics off this register's baseline",
        severity: "medium",
        detail: `Fragment rate and structural variety (sentence openers, punctuation mix) sit off where ${register} prose typically lands. Allow more sentence fragments and vary openers/punctuation more.`,
      })
    }
  }

  const paragraphs = splitParagraphs(text)
  // Floor for both D1 families below, per the spec's own residual-FPR note:
  // a short, informal piece can contain a lone one-sentence paragraph that
  // matches family A's shape (e.g. a text message that's just "I have a
  // few things to do today") without it meaning anything. At piece length,
  // that's noise the ≥250-word floor is meant to filter out; only a
  // sustained piece earns the paragraph-shape scrutiny below.
  const totalWords = metrics.sentenceLengthsWords.reduce((sum, n) => sum + n, 0)
  const clearsSelfDescribingStructureFloor = totalWords >= SELF_DESCRIBING_STRUCTURE_MIN_WORDS

  if (clearsSelfDescribingStructureFloor && hasAnnouncedEnumerationParagraph(paragraphs)) {
    findings.push({
      id: "self-describing-enumeration",
      name: "Self-describing structure: announced enumeration",
      severity: "high",
      confidence: "red",
      detail:
        'A short, standalone paragraph announces how many things/reasons/parts are coming ("Three parts of my track record speak directly to...") instead of the organization just being clear from the writing. Cut the announcement.',
    })
  }

  // Family B only, not family A: numbered/ordinal structure ("First, ...
  // Second, ...") is the correct form for reference docs and meeting
  // minutes, not a scaffold showing through, the same reasoning
  // REGISTER_DETECTOR_SUPPRESSIONS uses for markdown-heading-leak in
  // score.ts. Family A's announced-enumeration paragraph has no such
  // legitimate-in-this-register reading, so it stays unsuppressed.
  //
  // "essay" and "blog" are suppressed too, beyond what the spec's Part 2
  // named (docs and memo only) — added after measuring real regressions
  // against assay's labeled corpora (github.com/AIStoryHub/assay), not by
  // assumption:
  //  - "essay": pooled AUC on its own corpus (24 pre-2021 Rust RFCs /
  //    Python PEPs vs. two AI tiers) dropped 0.900 -> 0.884 with family B
  //    unsuppressed, traced to a real PEP (pep-0563) using "First, this
  //    only addresses... Second, this throws the baby out... Finally,
  //    Guido van Rossum declared..." to enumerate rationale in ordinary
  //    prose, the same legitimate structure docs/memo were already
  //    suppressed for.
  //  - "blog": pooled AUC on its own corpus (30 pre-2021 Rust/Electron blog
  //    posts vs. two AI tiers) dropped 0.8195 -> 0.805, traced to two real
  //    Rust release-note posts using "First, a meta note..." / "Finally, a
  //    few documentation improvements..." as ordinary changelog transitions.
  // Confirmed both fixes: re-measuring with each register added here
  // restored its pre-D1 baseline (see the same PR's efficacy-baselines.json
  // update).
  const ordinalScaffoldSuppressed =
    register === "docs" || register === "memo" || register === "essay" || register === "blog"
  const ordinalScaffoldCount = countOrdinalScaffoldParagraphs(paragraphs)
  if (
    !ordinalScaffoldSuppressed &&
    clearsSelfDescribingStructureFloor &&
    ordinalScaffoldCount >= ORDINAL_SCAFFOLD_MIN_PARAGRAPHS
  ) {
    findings.push({
      id: "self-describing-ordinal-scaffold",
      name: "Self-describing structure: ordinal slot scaffold",
      severity: "medium",
      confidence: "orange",
      detail: `${ordinalScaffoldCount} paragraphs open as a bare "first / second / third / finally" slot (e.g. "Major gifts, first.") instead of an idea in its own right. Let each paragraph argue on its own terms.`,
    })
  }

  return findings
}

// ---------------------------------------------------------------------------
// Strengths: the audit's findings are all deductions, which pushes only
// toward blandness (see SKILL.md's own warning that over-fixing "produces
// sterile prose, which is its own tell"). These signals are the other side
// of the ledger: reasons a piece is working, not just ways it's flagged, so
// there's something to weigh against sanding off every edge.

export interface StrengthSignals {
  /** Proper-noun-like words (mid-sentence capitalized tokens) and numerals,
   * per 1000 words. Named specifics beat generic placeholders. */
  specificityPer1000Words: number
  /** Specificity hits (see above) divided by abstraction-suffix word count
   * (-tion, -ment, -ness, -ity, -ance, -ence, ...). Higher means concrete
   * detail is outweighing abstract nominalization, not the reverse. */
  concreteAbstractRatio: number
  /** Same coefficient-of-variation signal as computeWholePieceMetrics's
   * sentenceBurstiness, surfaced here as a strength when it's high, not
   * only as a finding when it's low. */
  sentenceBurstiness: number
  /** Plain-language observations, only for signals that clear a real
   * threshold: this is "here's what's working," not a restated number. */
  notes: string[]
}

const ABSTRACTION_SUFFIXES = ["tion", "sion", "ment", "ness", "ity", "ance", "ence"]

function isAbstractionWord(word: string): boolean {
  const w = word.toLowerCase()
  return ABSTRACTION_SUFFIXES.some((suffix) => w.length > suffix.length + 2 && w.endsWith(suffix))
}

function isProperNounLike(word: string): boolean {
  return /^[A-Z][A-Za-z'-]*$/.test(word)
}

const NUMERAL_RE = /\b\d[\d,.]*\b/g

/** Computes the strengths side of the audit, see StrengthSignals. Pure,
 * same corpus-free heuristic style as computeWholePieceMetrics: legible
 * thresholds over signals already reachable from the raw text, not a
 * fitted model. */
export function computeStrengthSignals(text: string): StrengthSignals {
  const paragraphs = splitParagraphs(text)
  const sentences = paragraphs.flatMap((p) => splitSentences(p))
  const wordCount = (text.match(/[A-Za-z]+|\d[\d,.]*/g) ?? []).length || 1

  let properNounHits = 0
  let abstractionHits = 0
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean)
    words.forEach((raw, i) => {
      const clean = raw.replace(/[^A-Za-z'-]/g, "")
      if (!clean) return
      if (i > 0 && isProperNounLike(clean)) properNounHits++
      if (isAbstractionWord(clean)) abstractionHits++
    })
  }

  const numeralHits = (text.match(NUMERAL_RE) ?? []).length
  const specificityHits = properNounHits + numeralHits
  const specificityPer1000Words = Number(((specificityHits / wordCount) * 1000).toFixed(1))
  const concreteAbstractRatio = Number((specificityHits / Math.max(1, abstractionHits)).toFixed(2))
  const { sentenceBurstiness } = computeWholePieceMetrics(text)

  const notes: string[] = []
  if (specificityPer1000Words >= 15) {
    notes.push("Specific: names, numbers, and concrete detail carry real weight here.")
  }
  if (concreteAbstractRatio >= 2) {
    notes.push("Grounded: concrete detail outweighs abstract nominalizations by a healthy margin.")
  }
  if (sentenceBurstiness >= 0.5) {
    notes.push("Real sentence-rhythm variation, not a flattened, uniform cadence.")
  }

  return { specificityPer1000Words, concreteAbstractRatio, sentenceBurstiness, notes }
}
