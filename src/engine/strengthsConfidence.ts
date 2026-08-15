/**
 * Guards engine/structural-detectors.ts's computeStrengthSignals against
 * being read as a confident measurement on text too short to support one:
 * specificityPer1000Words and sentenceBurstiness are both division
 * artifacts at a handful of words (a 2-word file can read "1000/1k
 * specificity" and "perfect burstiness"), and computeStrengthSignals's
 * notes assert those as plain-language claims ("real sentence-rhythm
 * variation") with no confidence caveat of their own.
 *
 * The numbers themselves aren't wrong for what they are, so this doesn't
 * touch the engine; it's purely a consumption-side guard, same pattern as
 * matchVoice.ts's MIN_WORDS_FOR_CONFIDENT_READ / "low" confidence verdict.
 * Both consumers of strengths (the CLI's formatText and the audit_text MCP
 * tool) apply it, so neither can present the same misreading.
 */
import type { StrengthSignals } from "./structural-detectors.js";

/** Below this, burstiness and specificity-per-1000-words don't have enough
 * sentences/words behind them to mean anything; ~150 words is a handful of
 * sentences, the minimum for burstiness (sentence-length variance) to be
 * more than noise. */
export const MIN_WORDS_FOR_STRENGTHS = 150;

export function hasReliableStrengths(wordCount: number): boolean {
  return wordCount >= MIN_WORDS_FOR_STRENGTHS;
}

/** Replaces computeStrengthSignals's notes with an explicit low-confidence
 * caveat when wordCount is too low to trust them, leaving the numbers
 * alone (a caller with wordCount already has what it needs to judge those).
 * A no-op on empty input: auditText already returns empty notes there. */
export function guardStrengthsNotes(strengths: StrengthSignals, wordCount: number): StrengthSignals {
  if (wordCount === 0 || hasReliableStrengths(wordCount)) return strengths;
  return {
    ...strengths,
    notes: [
      `Only ${wordCount} word${wordCount === 1 ? "" : "s"}: too little text to read strengths reliably (aim for at least ${MIN_WORDS_FOR_STRENGTHS}). Treat these numbers as noise, not a measurement.`,
    ],
  };
}
