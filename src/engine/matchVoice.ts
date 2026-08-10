import { computeTextStats, type TextStats } from "./textStats.js";
import { statsToDials, MECHANICAL_DIAL_KEYS, type MechanicalDials } from "./dials.js";

export interface VoiceMatchFinding {
  dial: keyof MechanicalDials;
  target: number;
  actual: number;
  delta: number;
  note: string;
}

/** Named for what's actually measured (rhythm/mechanics), not for who wrote
 * the text: see VOICE_MATCH_CAVEAT. Was "close match" / "off voice" before
 * a review found the old names read as an authorship claim the underlying
 * measurement can't support. */
export type VoiceMatchVerdict = "on rhythm" | "some drift" | "off rhythm";

export interface VoiceMatchResult {
  verdict: VoiceMatchVerdict;
  matchScore: number;
  findings: VoiceMatchFinding[];
  /** "low" below MIN_WORDS_FOR_CONFIDENT_READ: too little text for the
   * rhythm dials to mean much, so the verdict is a guess dressed up as a
   * measurement. */
  confidence: "low" | "normal";
  /** Always present. This score tracks sentence/paragraph rhythm and
   * mechanics only, the same shape genre or register produces regardless of
   * who wrote a piece, so it cannot by itself tell the target writer's own
   * text apart from someone else's text written to match the same voice.
   * Weigh it as one signal on drift, not as proof of (or against)
   * authorship. */
  caveat: string;
}

const VOICE_MATCH_CAVEAT =
  "This measures sentence/paragraph rhythm and mechanics against the trained baseline, not who wrote the text. Text written or edited to match this voice's register can come back \"on rhythm\" even if the target writer never touched it; a real off-voice draft by the target writer can still come back drifted. Use it to catch rhythm drift after drafting, not to verify authorship.";

/** Below this word count, rhythm/paragraph-variance dials are computed from
 * too few sentences to be more than noise; see checkVoiceMatchTool's
 * short-input guard. */
export const MIN_WORDS_FOR_CONFIDENT_READ = 50;

const DIAL_NOTES: Record<keyof MechanicalDials, { tooHigh: string; tooLow: string }> = {
  sentenceLength: {
    tooHigh: "Sentences are running longer than usual for this voice.",
    tooLow: "Sentences are shorter and choppier than usual for this voice.",
  },
  sentenceRhythmVariance: {
    tooHigh: "Sentence length is more bursty and uneven than usual for this voice.",
    tooLow: "Sentence length is flatter and more uniform than usual for this voice.",
  },
  paragraphVariance: {
    tooHigh: "Paragraph lengths are more uneven than usual for this voice.",
    tooLow: "Paragraphs are more uniform than usual; this voice tends to vary them more.",
  },
  contractionUse: {
    tooHigh: "Uses more contractions than usual for this voice.",
    tooLow: "Uses fewer contractions than usual; reads more formal than this voice normally does.",
  },
  emDashUse: {
    tooHigh: "Leans on em dashes more than this voice usually does.",
    tooLow: "This voice usually uses more em dashes than this draft does.",
  },
  fragmentTolerance: {
    tooHigh: "More sentence fragments than usual for this voice.",
    tooLow: "Fewer fragments than usual; reads more buttoned-up than this voice normally does.",
  },
  questionUse: {
    tooHigh: "Asks more direct questions than usual for this voice.",
    tooLow: "Asks fewer direct questions than usual for this voice.",
  },
  entropy: {
    tooHigh: "Reads looser and more structurally chaotic than usual for this voice.",
    tooLow: "Reads tidier and more uniform in structure than usual for this voice.",
  },
};

/** 0-100 scale (same scale as the dials themselves). Below this, a gap reads
 * as noise, not drift, so it's not worth surfacing to the user. */
const DRIFT_THRESHOLD = 25;

/** A single dial past this point is drift severe enough to call the draft
 * off rhythm on its own, no matter how close the other dials are. */
const OFF_RHYTHM_SINGLE_DIAL_THRESHOLD = 50;

/**
 * Compare a piece of drafted text's measured rhythm against a trained or
 * dial-built voice's baseline stats, on the same 7 mechanical dials
 * train_style/create_style_from_dials use. Pure function, no LLM call.
 */
export function compareToVoice(text: string, targetStats: TextStats): VoiceMatchResult {
  const actualStats = computeTextStats(text);
  const actualDials = statsToDials(actualStats);
  const targetDials = statsToDials(targetStats);

  const findings: VoiceMatchFinding[] = [];
  let totalDelta = 0;
  let maxDelta = 0;

  for (const key of MECHANICAL_DIAL_KEYS) {
    const target = targetDials[key];
    const actual = actualDials[key];
    const delta = Math.abs(actual - target);
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta >= DRIFT_THRESHOLD) {
      const notes = DIAL_NOTES[key];
      findings.push({
        dial: key,
        target,
        actual,
        delta,
        note: actual > target ? notes.tooHigh : notes.tooLow,
      });
    }
  }

  findings.sort((a, b) => b.delta - a.delta);

  const avgDelta = totalDelta / MECHANICAL_DIAL_KEYS.length;
  const matchScore = Math.max(0, Math.round(100 - avgDelta));

  // The verdict is driven by whichever is worse, the average or the single
  // biggest outlier, so one dial blowing way past the others can't get
  // diluted into "on rhythm" by seven dials sitting near zero.
  const verdict: VoiceMatchVerdict =
    avgDelta >= 35 || maxDelta >= OFF_RHYTHM_SINGLE_DIAL_THRESHOLD
      ? "off rhythm"
      : avgDelta >= 15 || maxDelta >= DRIFT_THRESHOLD
        ? "some drift"
        : "on rhythm";

  const confidence: VoiceMatchResult["confidence"] =
    actualStats.wordCount < MIN_WORDS_FOR_CONFIDENT_READ ? "low" : "normal";
  const caveat =
    confidence === "low"
      ? `Only ${actualStats.wordCount} words: too little text for a reliable rhythm read (aim for at least ${MIN_WORDS_FOR_CONFIDENT_READ}). Treat this verdict as a rough guess, not a measurement. ${VOICE_MATCH_CAVEAT}`
      : VOICE_MATCH_CAVEAT;

  return { verdict, matchScore, findings, confidence, caveat };
}
