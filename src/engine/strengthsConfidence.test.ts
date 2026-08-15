import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_WORDS_FOR_STRENGTHS, hasReliableStrengths, guardStrengthsNotes } from "./strengthsConfidence.js";

test("hasReliableStrengths is false below the floor and true at/above it", () => {
  assert.equal(hasReliableStrengths(0), false);
  assert.equal(hasReliableStrengths(MIN_WORDS_FOR_STRENGTHS - 1), false);
  assert.equal(hasReliableStrengths(MIN_WORDS_FOR_STRENGTHS), true);
  assert.equal(hasReliableStrengths(MIN_WORDS_FOR_STRENGTHS + 500), true);
});

test("guardStrengthsNotes replaces notes with a caveat below the floor, leaving the numbers untouched", () => {
  const strengths = { specificityPer1000Words: 1000, concreteAbstractRatio: 1, sentenceBurstiness: 1, notes: ["Real sentence-rhythm variation, not a flattened, uniform cadence."] };
  const guarded = guardStrengthsNotes(strengths, 2);
  assert.equal(guarded.specificityPer1000Words, 1000);
  assert.equal(guarded.concreteAbstractRatio, 1);
  assert.equal(guarded.sentenceBurstiness, 1);
  assert.equal(guarded.notes.length, 1);
  assert.match(guarded.notes[0], /Only 2 words/);
  assert.match(guarded.notes[0], /noise, not a measurement/);
});

test("guardStrengthsNotes is a no-op at/above the floor", () => {
  const strengths = { specificityPer1000Words: 50, concreteAbstractRatio: 2, sentenceBurstiness: 0.6, notes: ["Grounded: concrete detail outweighs abstract nominalizations by a healthy margin."] };
  const guarded = guardStrengthsNotes(strengths, MIN_WORDS_FOR_STRENGTHS);
  assert.deepEqual(guarded, strengths);
});

test("guardStrengthsNotes is a no-op on empty input (engine already returns empty notes there)", () => {
  const strengths = { specificityPer1000Words: 0, concreteAbstractRatio: 0, sentenceBurstiness: 0, notes: [] };
  const guarded = guardStrengthsNotes(strengths, 0);
  assert.deepEqual(guarded, strengths);
});

test("guardStrengthsNotes uses singular 'word' for a 1-word count", () => {
  const strengths = { specificityPer1000Words: 1000, concreteAbstractRatio: 1, sentenceBurstiness: 1, notes: [] };
  const guarded = guardStrengthsNotes(strengths, 1);
  assert.match(guarded.notes[0], /Only 1 word:/);
});
