import { computeTextStats, type TextStats } from "./textStats.js";
import { statsToDials, MECHANICAL_DIAL_KEYS, type MechanicalDials } from "./dials.js";

export interface VoiceMatchFinding {
  dial: keyof MechanicalDials;
  target: number;
  actual: number;
  delta: number;
  note: string;
}

export type VoiceMatchVerdict = "close match" | "some drift" | "off voice";

export interface VoiceMatchResult {
  verdict: VoiceMatchVerdict;
  matchScore: number;
  findings: VoiceMatchFinding[];
}

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
 * off voice on its own, no matter how close the other dials are. */
const OFF_VOICE_SINGLE_DIAL_THRESHOLD = 50;

/**
 * Compare a piece of drafted text's measured rhythm against a trained or
 * dial-built voice's baseline stats, on the same 7 mechanical dials
 * train_style/create_style_from_dials use. Pure function, no LLM call.
 */
export function compareToVoice(text: string, targetStats: TextStats): VoiceMatchResult {
  const actualDials = statsToDials(computeTextStats(text));
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
  // diluted into "close match" by seven dials sitting near zero.
  const verdict: VoiceMatchVerdict =
    avgDelta >= 35 || maxDelta >= OFF_VOICE_SINGLE_DIAL_THRESHOLD
      ? "off voice"
      : avgDelta >= 15 || maxDelta >= DRIFT_THRESHOLD
        ? "some drift"
        : "close match";

  return { verdict, matchScore, findings };
}
