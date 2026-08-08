import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOpener, detectSelfRepetition } from "./selfRepetition.js";
import type { SampleFingerprint } from "./voiceStore.js";

test("extractOpener lowercases and takes the first few words, ignoring punctuation", () => {
  assert.equal(extractOpener("Not today. This is a much longer sentence."), "not today this is a much");
});

test("extractOpener is the same for two texts that share the same first six words, regardless of what follows", () => {
  const a = extractOpener("Not today, honestly, that's the deal, full stop.");
  const b = extractOpener("Not today, honestly, that's the deal, whatever anyone else thinks about it.");
  assert.equal(a, b);
});

function fingerprint(opener: string, topBigrams: string[] = [], trainedAt = "2026-01-01T00:00:00.000Z"): SampleFingerprint {
  return { trainedAt, opener, topBigrams };
}

const SHARED_OPENER_TEXT = "Not today, honestly. That's the deal, full stop.";
const OTHER_OPENER_TEXT = "Something totally different starts this one off instead.";
const sharedOpener = extractOpener(SHARED_OPENER_TEXT);
const otherOpener = extractOpener(OTHER_OPENER_TEXT);

test("detectSelfRepetition returns nothing below the minimum history size", () => {
  const history = [fingerprint(sharedOpener), fingerprint(sharedOpener)];
  const findings = detectSelfRepetition(SHARED_OPENER_TEXT, history);
  assert.deepEqual(findings, []);
});

test("detectSelfRepetition flags a repeated opener once it clears the threshold", () => {
  const history = [
    fingerprint(sharedOpener),
    fingerprint(sharedOpener),
    fingerprint(otherOpener),
    fingerprint(otherOpener),
  ];
  const findings = detectSelfRepetition(SHARED_OPENER_TEXT, history);
  const openerFinding = findings.find((f) => f.kind === "opener");
  assert.ok(openerFinding, "expected an opener finding");
  assert.equal(openerFinding!.matches, 2);
  assert.equal(openerFinding!.total, 4);
  assert.match(openerFinding!.detail, /2 of your last 4 pieces/);
});

test("detectSelfRepetition stays quiet on an opener that doesn't recur often enough", () => {
  const history = [
    fingerprint(sharedOpener),
    fingerprint(otherOpener),
    fingerprint(extractOpener("A third distinct opener text goes here now.")),
    fingerprint(extractOpener("Yet another unique one shows up right here.")),
  ];
  const findings = detectSelfRepetition(SHARED_OPENER_TEXT, history);
  assert.ok(!findings.some((f) => f.kind === "opener"));
});

test("detectSelfRepetition flags a phrase that recurs across several past samples", () => {
  const history = [
    fingerprint(otherOpener, ["retry logic", "next week"]),
    fingerprint(otherOpener, ["retry logic", "the budget"]),
    fingerprint(otherOpener, ["something else"]),
  ];
  // Draft's own topBigrams will include "retry logic" since it repeats there.
  const draft =
    "The retry logic broke again today. We traced the retry logic back to the same root cause as before.";
  const findings = detectSelfRepetition(draft, history);
  const phraseFinding = findings.find((f) => f.kind === "phrase" && f.term === "retry logic");
  assert.ok(phraseFinding, "expected a phrase finding for 'retry logic'");
  assert.equal(phraseFinding!.matches, 2);
  assert.equal(phraseFinding!.total, 3);
});

test("detectSelfRepetition sorts findings by strength, strongest match fraction first", () => {
  // opener: 4/4 = 1.0, "strong phrase": 3/4 = 0.75, "weak phrase": 2/4 = 0.5
  const history = [
    fingerprint(sharedOpener, ["strong phrase", "weak phrase"]),
    fingerprint(sharedOpener, ["strong phrase", "weak phrase"]),
    fingerprint(sharedOpener, ["strong phrase"]),
    fingerprint(sharedOpener, []),
  ];
  const draft =
    "Not today, honestly. That's the deal, and it repeats the strong phrase and the weak phrase, then repeats the strong phrase and the weak phrase again.";
  const findings = detectSelfRepetition(draft, history);
  assert.ok(findings.length >= 3, `expected at least 3 findings, got ${findings.length}`);
  for (let i = 1; i < findings.length; i++) {
    const prevStrength = findings[i - 1].matches / findings[i - 1].total;
    const currStrength = findings[i].matches / findings[i].total;
    assert.ok(prevStrength >= currStrength);
  }
});
