import type { TextStats } from "./textStats.js";

/**
 * The 8 mechanical dials, each a 0-100 slider mapped onto a TextStats field
 * that describeStats() actually reads. Ranges are chosen to straddle
 * describeStats()'s own thresholds (see textStats.ts) so a slider move
 * visibly changes the generated guide, not just the raw number.
 */
export interface MechanicalDials {
  sentenceLength: number;
  sentenceRhythmVariance: number;
  paragraphVariance: number;
  contractionUse: number;
  emDashUse: number;
  fragmentTolerance: number;
  questionUse: number;
  /** "Human touch" dial, 0-100: how much AI-typical structural regularity to
   * deliberately break: varied sentence openers, uneven punctuation choices,
   * looser transitions, less forced parallelism. See entropyGuideLine()
   * below. Deliberately NOT about grammar errors or factual accuracy; those
   * stay out of scope regardless of this dial's value. */
  entropy: number;
}

/** The 3 persona dials, 0-10 to match presets.json's existing scale. */
export interface PersonaDials {
  formality: number;
  warmth: number;
  directness: number;
}

export type StyleDials = MechanicalDials & PersonaDials;

interface DialRange {
  field: keyof TextStats;
  min: number;
  max: number;
}

const DIAL_RANGES: Record<keyof MechanicalDials, DialRange> = {
  sentenceLength: { field: "avgSentenceLength", min: 8, max: 30 },
  sentenceRhythmVariance: { field: "sentenceLengthStdDev", min: 2, max: 12 },
  paragraphVariance: { field: "paragraphLengthCV", min: 0.1, max: 0.8 },
  contractionUse: { field: "contractionRate", min: 0, max: 3 },
  emDashUse: { field: "emDashPer1000Words", min: 0, max: 6 },
  fragmentTolerance: { field: "fragmentRate", min: 0, max: 0.15 },
  questionUse: { field: "questionRate", min: 0, max: 0.1 },
  entropy: { field: "structuralEntropy", min: 0.15, max: 0.75 },
};

export const MECHANICAL_DIAL_KEYS = Object.keys(DIAL_RANGES) as (keyof MechanicalDials)[];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function interpolate(dialValue: number, range: DialRange): number {
  const t = clamp(dialValue, 0, 100) / 100;
  return range.min + t * (range.max - range.min);
}

function deinterpolate(fieldValue: number, range: DialRange): number {
  const t = (fieldValue - range.min) / (range.max - range.min);
  return Math.round(clamp(t, 0, 1) * 100);
}

/** Neutral, unused-by-describeStats defaults for the TextStats fields that
 * have no corresponding slider. See textStats.ts's describeStats(), which
 * only reads the 7 fields the dial table above covers. */
const NEUTRAL_STATS_DEFAULTS = {
  wordCount: 0,
  sentenceCount: 0,
  avgParagraphSentences: 3,
  semicolonPer1000Words: 0,
  avgWordLength: 4.7,
  // Moderate middle value. Only used via dialsToStats() for a dial-built
  // voice, where warmth is set directly by the caller rather than inferred
  // from this, so it's mostly a placeholder to keep TextStats well-formed.
  relationalPronounRate: 15,
  topBigrams: [] as string[],
  topWords: [] as string[],
};

export function dialsToStats(dials: MechanicalDials): TextStats {
  const stats = { ...NEUTRAL_STATS_DEFAULTS } as unknown as TextStats;
  for (const key of MECHANICAL_DIAL_KEYS) {
    const range = DIAL_RANGES[key];
    (stats as unknown as Record<string, number>)[range.field] = Number(
      interpolate(dials[key], range).toFixed(3)
    );
  }
  return stats;
}

/**
 * Prose instruction for the entropy dial, on the same 0-100 scale as the
 * dial itself. Used by presets.ts's presetGuideText(), since presets carry
 * a plain 0-100 entropy value rather than measured stats.
 *
 * textStats.ts has its own describeEntropy() with matching thresholds/text,
 * operating on the raw 0-1 structuralEntropy scale for trained/dial-built
 * voices, deliberately duplicated rather than shared, because both this
 * file and textStats.ts are loaded directly by client components
 * (NewStyleForm.tsx, EditStyleForm.tsx) for the live dial preview, and
 * Turbopack can't resolve a `.js`-suffixed relative import between sibling
 * .ts files reached that way. If you change the wording, change it in both
 * places.
 *
 * Deliberately scoped to structure and rhythm, not correctness: no branch
 * here ever asks for a typo, a grammar slip, or a factual error. Research
 * on AI-text detection (perplexity/burstiness) and human-vs-AI writing
 * studies point to structural regularity, not error rate, as the
 * discriminating signal worth targeting for a professional writing tool,
 * see src/data/SOURCES.md.
 */
export function entropyGuideLine(dialValue: number): string {
  const v = clamp(Number.isFinite(dialValue) ? dialValue : DEFAULT_MECHANICAL_DIALS.entropy, 0, 100);
  if (v < 30) {
    return "Keep structure tidy and predictable: consistent sentence openers, clean transitions, punctuation kept plain (mostly periods and commas). Orderly reads right here.";
  }
  if (v < 65) {
    return "Let some structural looseness through: vary sentence openers now and then instead of repeating the same one, allow an occasional aside, and don't force every list into a neat three-part shape.";
  }
  return "Let structure stay rough at the edges, the way a real draft does: vary how sentences open instead of leaning on 'The' or 'This,' let punctuation choices differ from paragraph to paragraph (a dash here, a parenthetical there, not by formula), skip transitions that just announce the next sentence, and don't force parallel structure. A stray aside or a sentence that doubles back on itself is fine. A typo or a factual error is not; this dial changes shape, not accuracy.";
}

export function statsToDials(stats: TextStats): MechanicalDials {
  const result = {} as MechanicalDials;
  for (const key of MECHANICAL_DIAL_KEYS) {
    const range = DIAL_RANGES[key];
    const raw = stats[range.field] as number | undefined;
    // A voice profile persisted before a dial existed (e.g. entropy, added
    // 2026-08-07) won't actually have every field on disk/in Postgres,
    // despite TextStats's type saying they're all required; deinterpolate
    // would divide against undefined and return NaN. Fall back to that
    // dial's own default instead of propagating NaN into the UI.
    result[key] = Number.isFinite(raw) ? deinterpolate(raw as number, range) : DEFAULT_MECHANICAL_DIALS[key];
  }
  return result;
}

export const DEFAULT_PERSONA_DIALS: PersonaDials = { formality: 5, warmth: 5, directness: 5 };

/** Neutral mechanical defaults used when forking a preset into a trained
 * voice, before the user has retrained from their own samples. emDashUse
 * defaults to 0, matching this product's own no-em-dash rule. */
export const DEFAULT_MECHANICAL_DIALS: MechanicalDials = {
  sentenceLength: 50,
  sentenceRhythmVariance: 50,
  paragraphVariance: 50,
  contractionUse: 60,
  emDashUse: 0,
  fragmentTolerance: 20,
  questionUse: 10,
  entropy: 40,
};

/**
 * Estimates the 3 persona dials from measured mechanics, for a freshly
 * trained voice that has no persona dials set yet. Better than leaving every
 * trained voice at the flat DEFAULT_PERSONA_DIALS (5/5/5): a trained voice
 * should read differently from a blank one. These are legible, threshold-
 * driven heuristics from signals already computed, not a fitted model,
 * and the user can always override any of the three afterward via
 * update_style once it's been inferred once.
 */
export function inferPersonaDials(stats: TextStats): PersonaDials {
  const clamp10 = (n: number) => Math.round(clamp(n, 0, 10));

  // Formal writing avoids contractions and reaches for longer words.
  const contractionComponent = clamp(10 - stats.contractionRate * 4, 0, 10);
  const wordLengthComponent = clamp((stats.avgWordLength - 4) * 5, 0, 10);
  const formality = clamp10((contractionComponent + wordLengthComponent) / 2);

  // Direct writing favors short sentences and tolerates fragments for punch;
  // sentence length carries more signal than fragments, which are noisier.
  const sentenceLengthComponent = clamp(10 - ((stats.avgSentenceLength - 8) / 22) * 10, 0, 10);
  const fragmentComponent = clamp((stats.fragmentRate / 0.15) * 10, 0, 10);
  const directness = clamp10(sentenceLengthComponent * 0.7 + fragmentComponent * 0.3);

  // Warmth: how often the writer puts themselves on the page with the
  // reader ("you", "we") rather than staying in the third person.
  const warmth = clamp10((stats.relationalPronounRate / 40) * 10);

  return { formality, warmth, directness };
}

function personaBandLine(value: number, low: string, mid: string, high: string): string {
  if (value <= 3) return low;
  if (value <= 6) return mid;
  return high;
}

/**
 * Prose instructions for the 3 persona dials, in the same hand-written-guide
 * spirit as a preset's own guide text (see presets.json) rather than a bare
 * stat readout. Composed together with describeStats()'s mechanical
 * description, this is what makes a trained voice's guide (see
 * voiceStore.fs.ts) read like drafting instructions instead of a data dump.
 */
export function personaGuideText(dials: PersonaDials): string {
  return [
    personaBandLine(
      dials.formality,
      "Reads informal and conversational: contractions, plain words, no throat-clearing.",
      "Moderately formal: contractions are fine, but skip outright slang.",
      "Reads formal: fuller words, contractions used sparingly if at all, no slang."
    ),
    personaBandLine(
      dials.warmth,
      "Reads businesslike and reserved; warmth comes from clarity, not friendliness.",
      "Some warmth: occasional direct address to the reader, without overdoing it.",
      "Reads warm and personable: address the reader directly. Warmth comes from specificity, not adjectives like 'exciting' or 'wonderful'."
    ),
    personaBandLine(
      dials.directness,
      "Comfortable circling a point before landing it; context and qualifications can come first.",
      "Gets to the point within a sentence or two, with some room for setup.",
      "Opens on the point, not the windup. Qualifications go in a single trailing clause, not a paragraph."
    ),
  ].join(" ");
}
