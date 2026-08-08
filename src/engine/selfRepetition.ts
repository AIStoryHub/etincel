/**
 * Self-repetition detection: "you've opened this way in 4 of your last 6
 * pieces." Compares a new draft's opener and characteristic phrasing
 * against a voice's recorded sample history (see voiceStore.ts's
 * SampleFingerprint), flagging patterns that recur often enough to read as
 * a habit, not a coincidence. Pure, no LLM call, same trust-mode spirit as
 * audit_text: a signal to weigh, not an auto-rewrite trigger.
 */
import { computeTextStats } from "./textStats.js";
import type { SampleFingerprint } from "./voiceStore.js";

const OPENER_WORD_COUNT = 6;

/** Normalizes text down to its first few words, lowercased and stripped of
 * punctuation, for opener-repetition comparison. Used both when a sample's
 * fingerprint is recorded (voiceStore.fs.ts's trainVoice) and when a new
 * draft is checked here, so a real repeat isn't missed by inconsistent
 * normalization on either side. */
export function extractOpener(text: string, wordCount = OPENER_WORD_COUNT): string {
  const words = (text.match(/[A-Za-z']+/g) ?? []).slice(0, wordCount);
  return words.map((w) => w.toLowerCase()).join(" ");
}

export interface RepetitionFinding {
  kind: "opener" | "phrase";
  term: string;
  detail: string;
  /** How many of the compared history entries share this pattern. */
  matches: number;
  /** How many history entries were compared against. */
  total: number;
}

/** Below this fraction of recent samples, a shared opener or phrase reads
 * as coincidence, not habit. */
const OPENER_REPETITION_THRESHOLD = 0.4;
const PHRASE_REPETITION_THRESHOLD = 0.3;
/** Fewer than this many past samples isn't enough to call anything a
 * pattern yet. */
const MIN_HISTORY_FOR_COMPARISON = 3;

/**
 * Compares draftText against a voice's sample history for two kinds of
 * self-repetition: reusing the same opening words, or reusing a
 * characteristic phrase (bigram) across several past pieces. Returns
 * findings sorted by how strong the pattern is (highest match fraction
 * first). Empty history, or history below MIN_HISTORY_FOR_COMPARISON,
 * yields no findings rather than a false "everything repeats" verdict on
 * too little data.
 */
export function detectSelfRepetition(draftText: string, history: SampleFingerprint[]): RepetitionFinding[] {
  const findings: RepetitionFinding[] = [];
  if (history.length < MIN_HISTORY_FOR_COMPARISON) return findings;

  const draftOpener = extractOpener(draftText);
  if (draftOpener) {
    const openerMatches = history.filter((h) => h.opener === draftOpener).length;
    if (openerMatches / history.length >= OPENER_REPETITION_THRESHOLD) {
      findings.push({
        kind: "opener",
        term: draftOpener,
        matches: openerMatches,
        total: history.length,
        detail: `This draft opens the same way as ${openerMatches} of your last ${history.length} pieces: "${draftOpener}...".`,
      });
    }
  }

  const draftBigrams = computeTextStats(draftText).topBigrams;
  if (draftBigrams.length > 0) {
    const draftBigramSet = new Set(draftBigrams);
    const phraseMatchCounts = new Map<string, number>();
    for (const entry of history) {
      for (const bigram of entry.topBigrams) {
        if (draftBigramSet.has(bigram)) {
          phraseMatchCounts.set(bigram, (phraseMatchCounts.get(bigram) ?? 0) + 1);
        }
      }
    }
    for (const [phrase, matches] of phraseMatchCounts) {
      if (matches / history.length >= PHRASE_REPETITION_THRESHOLD) {
        findings.push({
          kind: "phrase",
          term: phrase,
          matches,
          total: history.length,
          detail: `"${phrase}" also shows up in ${matches} of your last ${history.length} pieces.`,
        });
      }
    }
  }

  return findings.sort((a, b) => b.matches / b.total - a.matches / a.total);
}
