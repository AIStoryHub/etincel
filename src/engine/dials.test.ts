import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dialsToStats,
  statsToDials,
  entropyGuideLine,
  inferPersonaDials,
  personaGuideText,
  DEFAULT_MECHANICAL_DIALS,
  MECHANICAL_DIAL_KEYS,
  type MechanicalDials,
} from "./dials.js";
import { describeStats, computeTextStats } from "./textStats.js";

const MIDPOINT: MechanicalDials = {
  sentenceLength: 50,
  sentenceRhythmVariance: 50,
  paragraphVariance: 50,
  contractionUse: 50,
  emDashUse: 50,
  fragmentTolerance: 50,
  questionUse: 50,
  entropy: 50,
};

const MIN: MechanicalDials = {
  sentenceLength: 0,
  sentenceRhythmVariance: 0,
  paragraphVariance: 0,
  contractionUse: 0,
  emDashUse: 0,
  fragmentTolerance: 0,
  questionUse: 0,
  entropy: 0,
};

const MAX: MechanicalDials = {
  sentenceLength: 100,
  sentenceRhythmVariance: 100,
  paragraphVariance: 100,
  contractionUse: 100,
  emDashUse: 100,
  fragmentTolerance: 100,
  questionUse: 100,
  entropy: 100,
};

test("dialsToStats maps 0 and 100 to each field's documented min/max", () => {
  const atMin = dialsToStats(MIN);
  const atMax = dialsToStats(MAX);
  assert.equal(atMin.avgSentenceLength, 8);
  assert.equal(atMax.avgSentenceLength, 30);
  assert.equal(atMin.sentenceLengthStdDev, 2);
  assert.equal(atMax.sentenceLengthStdDev, 12);
  assert.equal(atMin.contractionRate, 0);
  assert.equal(atMax.contractionRate, 3);
  assert.equal(atMin.emDashPer1000Words, 0);
  assert.equal(atMax.emDashPer1000Words, 6);
  assert.equal(atMin.structuralEntropy, 0.15);
  assert.equal(atMax.structuralEntropy, 0.75);
});

test("dialsToStats maps 50 to the midpoint of each range", () => {
  const stats = dialsToStats(MIDPOINT);
  assert.equal(stats.avgSentenceLength, 19); // (8+30)/2
  assert.equal(stats.contractionRate, 1.5);
  assert.equal(stats.emDashPer1000Words, 3);
});

test("dialsToStats fills non-dial TextStats fields with neutral, inert defaults", () => {
  const stats = dialsToStats(MIDPOINT);
  assert.equal(stats.wordCount, 0);
  assert.equal(stats.sentenceCount, 0);
  assert.deepEqual(stats.topBigrams, []);
});

test("statsToDials inverts dialsToStats at the boundaries", () => {
  assert.deepEqual(statsToDials(dialsToStats(MIN)), MIN);
  assert.deepEqual(statsToDials(dialsToStats(MAX)), MAX);
});

test("statsToDials round-trips the midpoint within rounding tolerance", () => {
  const roundTripped = statsToDials(dialsToStats(MIDPOINT));
  for (const key of MECHANICAL_DIAL_KEYS) {
    assert.ok(Math.abs(roundTripped[key] - MIDPOINT[key]) <= 1, `${key} drifted: ${roundTripped[key]}`);
  }
});

test("statsToDials clamps out-of-range field values into [0, 100]", () => {
  const stats = dialsToStats(MAX);
  stats.avgSentenceLength = 999; // wildly above the documented max
  const dials = statsToDials(stats);
  assert.equal(dials.sentenceLength, 100);
});

test("low-dial and high-dial profiles produce visibly different guides", () => {
  const shortGuide = describeStats(dialsToStats(MIN));
  const longGuide = describeStats(dialsToStats(MAX));
  assert.match(shortGuide, /sentences run short/i);
  assert.match(longGuide, /sentences run long/i);
  assert.notEqual(shortGuide, longGuide);
});

test("dial ranges span describeStats()'s own thresholds end to end", () => {
  // Each threshold documented in textStats.ts's describeStats should be
  // reachable within the dial's [min, max] range, or the slider would never
  // be able to produce that branch of the guide.
  const min = dialsToStats(MIN);
  const max = dialsToStats(MAX);
  assert.ok(min.avgSentenceLength <= 12 && max.avgSentenceLength >= 20);
  assert.ok(min.sentenceLengthStdDev < 8 && max.sentenceLengthStdDev >= 8);
  assert.ok(min.paragraphLengthCV < 0.5 && max.paragraphLengthCV >= 0.5);
  assert.ok(min.contractionRate <= 0.3 && max.contractionRate >= 1.5);
  assert.ok(min.emDashPer1000Words < 3 && max.emDashPer1000Words >= 3);
  assert.ok(min.fragmentRate < 0.08 && max.fragmentRate >= 0.08);
  assert.ok(min.questionRate < 0.05 && max.questionRate >= 0.05);
});

test("entropyGuideLine produces a distinct instruction at low, mid, and high dial values", () => {
  const low = entropyGuideLine(0);
  const mid = entropyGuideLine(50);
  const high = entropyGuideLine(100);
  assert.notEqual(low, mid);
  assert.notEqual(mid, high);
  assert.notEqual(low, high);
});

test("entropyGuideLine never instructs adding typos or factual errors, at any setting", () => {
  for (const v of [0, 25, 50, 75, 100]) {
    const line = entropyGuideLine(v).toLowerCase();
    assert.ok(!/\b(add|include|allow) an? typo\b/.test(line));
    assert.ok(!/\bmisspell/.test(line));
  }
});

test("entropy dial produces a distinct describeStats guide at low vs high", () => {
  const low = describeStats(dialsToStats({ ...MIDPOINT, entropy: 0 }));
  const high = describeStats(dialsToStats({ ...MIDPOINT, entropy: 100 }));
  assert.notEqual(low, high);
});

test("forking a preset seeds structuralEntropy from the preset's entropy value", () => {
  const stats = dialsToStats({ ...MIDPOINT, entropy: 80 });
  assert.ok(stats.structuralEntropy > dialsToStats({ ...MIDPOINT, entropy: 20 }).structuralEntropy);
});

test("statsToDials falls back to the default instead of NaN when a persisted voice predates a field", () => {
  // Simulates a voice profile saved to disk/Postgres before the entropy
  // dial existed: its stored TextStats literally has no structuralEntropy
  // key, despite the type saying it's required (regression: this used to
  // divide against undefined and surface NaN in the style-detail UI).
  const legacyStats = dialsToStats(MIDPOINT) as unknown as Record<string, unknown>;
  delete legacyStats.structuralEntropy;
  const dials = statsToDials(legacyStats as unknown as Parameters<typeof statsToDials>[0]);
  assert.ok(Number.isFinite(dials.entropy));
  assert.equal(dials.entropy, DEFAULT_MECHANICAL_DIALS.entropy);
});

test("describeStats never emits NaN-driven output for a legacy stats object missing structuralEntropy", () => {
  const legacyStats = dialsToStats(MIDPOINT) as unknown as Record<string, unknown>;
  delete legacyStats.structuralEntropy;
  const description = describeStats(legacyStats as unknown as Parameters<typeof describeStats>[0]);
  assert.ok(!description.includes("NaN"));
});

test("inferPersonaDials rates long-word, contraction-free prose as more formal than short-word, contraction-heavy prose", () => {
  const formal = computeTextStats(
    "The organization's quarterly performance indicates substantial improvement across several operational categories, warranting further examination before finalizing budgetary allocations."
  );
  const casual = computeTextStats("Yeah, we're doing great this quarter. You'll love the numbers, honestly. It's better all around.");
  assert.ok(inferPersonaDials(formal).formality > inferPersonaDials(casual).formality);
});

test("inferPersonaDials rates short, fragment-heavy prose as more direct than long, flowing prose", () => {
  const direct = computeTextStats("Ship it. No more delays. Today.");
  const indirect = computeTextStats(
    "Given the various considerations that have been raised over the past several weeks by different stakeholders, it might eventually be worth thinking about whether shipping could perhaps happen at some point soon."
  );
  assert.ok(inferPersonaDials(direct).directness > inferPersonaDials(indirect).directness);
});

test("inferPersonaDials rates direct-address prose as warmer than third-person prose", () => {
  const warm = computeTextStats("You'll notice we've fixed this for you. We want you to feel confident using our tool.");
  const cold = computeTextStats("The system processes requests according to a fixed schedule determined by administrators.");
  assert.ok(inferPersonaDials(warm).warmth > inferPersonaDials(cold).warmth);
});

test("inferPersonaDials always stays within the 0-10 persona scale", () => {
  const extreme = computeTextStats("You. We. Us. Yeah, it's, it's, it's, it's, it's, it's, it's, it's, it's, it's.");
  const dials = inferPersonaDials(extreme);
  for (const value of [dials.formality, dials.warmth, dials.directness]) {
    assert.ok(value >= 0 && value <= 10, `expected a value in [0, 10], got ${value}`);
  }
});

test("personaGuideText produces a distinct instruction at low, mid, and high dial values for each dimension", () => {
  for (const key of ["formality", "warmth", "directness"] as const) {
    const low = personaGuideText({ formality: 5, warmth: 5, directness: 5, [key]: 0 });
    const mid = personaGuideText({ formality: 5, warmth: 5, directness: 5, [key]: 5 });
    const high = personaGuideText({ formality: 5, warmth: 5, directness: 5, [key]: 10 });
    assert.notEqual(low, mid, `${key} low vs mid should differ`);
    assert.notEqual(mid, high, `${key} mid vs high should differ`);
    assert.notEqual(low, high, `${key} low vs high should differ`);
  }
});
