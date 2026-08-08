import { test } from "node:test";
import assert from "node:assert/strict";
import { compareToVoice } from "./matchVoice.js";
import { computeTextStats } from "./textStats.js";
import type { TextStats } from "./textStats.js";

test("text that mirrors the target voice's rhythm is a close match with no findings", () => {
  const voiceSample =
    "not the update i wanted to send but here we are. export flow's still flaky under load, found it wednesday. pushing the demo to friday instead of thursday.\n\nif you already blocked off thursday for the client, no need to unblock it, we'll use it to keep hammering on this. friday's the real one.";
  const targetStats = computeTextStats(voiceSample);

  const similarDraft =
    "not thrilled about this but here it is. the export step is still breaking under real load, caught it tuesday night. moving the review to monday instead of friday.\n\nif you already cleared friday for the walkthrough, leave it blocked, we'll keep digging into this instead. monday's the real one.";

  const result = compareToVoice(similarDraft, targetStats);
  assert.equal(result.verdict, "close match");
  assert.ok(result.matchScore >= 70, `expected a high match score, got ${result.matchScore}`);
});

test("formal, hedged text drifts from a short-contraction-heavy voice", () => {
  const voiceSample =
    "hey team - quick one. i moved the demo to thursday, giving us two more days before we're in front of the client. use them.";
  const targetStats = computeTextStats(voiceSample);

  const stiffDraft =
    "It is hereby communicated that the demonstration has been rescheduled to Thursday, thereby affording the team an additional period of two days in advance of the client presentation, which the team is strongly encouraged to utilize in full, notwithstanding any prior commitments that may have been previously scheduled during the intervening period.";

  const result = compareToVoice(stiffDraft, targetStats);
  assert.notEqual(result.verdict, "close match");
  assert.ok(result.findings.length > 0, "expected at least one drifted dial");
  const contractionFinding = result.findings.find((f) => f.dial === "contractionUse");
  assert.ok(contractionFinding, "expected contraction use to be flagged as drifted");
  assert.equal(contractionFinding!.note, "Uses fewer contractions than usual; reads more formal than this voice normally does.");
});

test("one dial drifting moderately is not diluted into a close match by the other seven sitting near zero (regression: dogfood memo 2026-08-07)", () => {
  const draft = "We shipped the update on time. The client was happy with results. Nothing broke in production this week.";
  const draftStats = computeTextStats(draft);
  // Same voice in every other respect, but a real, single-dial drift on
  // sentence length; everything else matches the draft exactly.
  const targetStats: TextStats = { ...draftStats, avgSentenceLength: draftStats.avgSentenceLength + 10 };

  const result = compareToVoice(draft, targetStats);
  const sentenceLengthFinding = result.findings.find((f) => f.dial === "sentenceLength");
  assert.ok(sentenceLengthFinding, "expected sentence length to be flagged as drifted");
  assert.ok(
    sentenceLengthFinding!.delta >= 25 && sentenceLengthFinding!.delta < 50,
    `expected a moderate single-dial delta between 25 and 50, got ${sentenceLengthFinding?.delta}`
  );
  assert.equal(
    result.verdict,
    "some drift",
    "a single moderate outlier dial should force at least 'some drift', not be averaged away into 'close match'"
  );
});

test("findings are sorted by delta, largest drift first", () => {
  const targetStats = computeTextStats(
    "Short line. Another short line. Keep it brief. Real short."
  );
  const draft =
    "This is a considerably longer and more elaborately constructed sentence than the ones this voice usually produces, deliberately extended well past its normal length, and it continues for quite some additional distance before finally arriving at its conclusion.";
  const result = compareToVoice(draft, targetStats);
  for (let i = 1; i < result.findings.length; i++) {
    assert.ok(result.findings[i - 1].delta >= result.findings[i].delta);
  }
});
