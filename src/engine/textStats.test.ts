import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTextStats, mergeStats, describeStats } from "./textStats.js";

test("empty text is guarded against divide-by-zero (wordCount floors at 1)", () => {
  const stats = computeTextStats("");
  assert.equal(stats.wordCount, 1);
  assert.equal(stats.sentenceCount, 0);
  assert.equal(stats.avgSentenceLength, 0);
});

test("detects contractions and computes contraction rate per word", () => {
  const withContractions = computeTextStats("I don't think it's fair. We haven't tried yet.");
  const withoutContractions = computeTextStats("I do not think it is fair. We have not tried yet.");
  assert.ok(withContractions.contractionRate > withoutContractions.contractionRate);
});

test("counts em dashes and semicolons per 1000 words", () => {
  const stats = computeTextStats("This is one point — and this is another; a third follows.");
  assert.ok(stats.emDashPer1000Words > 0);
  assert.ok(stats.semicolonPer1000Words > 0);
});

test("questionRate is the fraction of sentences ending in a question mark", () => {
  const stats = computeTextStats("Is this true? It might be. Who knows?");
  assert.equal(stats.sentenceCount, 3);
  assert.ok(Math.abs(stats.questionRate - 2 / 3) < 0.01);
});

test("fragmentRate counts sentences of 3 words or fewer", () => {
  const stats = computeTextStats("Not today. This is a much longer sentence than the others by far. Fine.");
  assert.equal(stats.sentenceCount, 3);
  assert.ok(Math.abs(stats.fragmentRate - 2 / 3) < 0.01);
});

test("relationalPronounRate counts you/your/we/our/us and is higher for direct-address prose", () => {
  const direct = computeTextStats("You'll notice we've fixed this for you. We want you to feel confident using our tool.");
  const thirdPerson = computeTextStats("The system processes requests according to a fixed schedule determined by administrators.");
  assert.ok(direct.relationalPronounRate > 0);
  assert.ok(direct.relationalPronounRate > thirdPerson.relationalPronounRate);
});

test("topBigrams only surfaces bigrams occurring 2+ times and skips stopword pairs", () => {
  const text = "risk management matters. risk management is hard. of the plan, of the budget, of the team.";
  const stats = computeTextStats(text);
  assert.ok(stats.topBigrams.includes("risk management"));
  assert.ok(!stats.topBigrams.some((b) => b === "of the"));
});

test("topBigrams ranks a distinctive repeated phrase above a generic one that repeats the same number of times (regression: used to rank by raw count alone)", () => {
  const text = [
    "Next week we will review the project plan with the team.",
    "Next week the team will also review the budget.",
    "Priya keeps flagging the retry logic as the real culprit.",
    "The retry logic broke again on Friday, and Priya was right about the retry logic all along.",
  ].join(" ");
  const stats = computeTextStats(text);
  const distinctiveRank = stats.topBigrams.indexOf("retry logic");
  const genericRank = stats.topBigrams.indexOf("next week");
  assert.ok(distinctiveRank !== -1, "expected 'retry logic' to be captured at all");
  assert.ok(genericRank === -1 || distinctiveRank < genericRank, "expected the distinctive phrase to rank above the generic one");
});

test("topWords surfaces uncommon, recurring words and excludes stopwords", () => {
  const text = [
    "Priya keeps flagging the retry logic as the real culprit.",
    "The retry logic broke again on Friday, and Priya was right about the retry logic all along.",
  ].join(" ");
  const stats = computeTextStats(text);
  assert.ok(stats.topWords.includes("retry"));
  assert.ok(!stats.topWords.some((w) => ["the", "and", "as", "on"].includes(w)));
});

test("topWords ranks an uncommon recurring word above a common word repeated the same number of times", () => {
  const text = [
    "Priya shipped the retry fix. The retry fix held through the week.",
    "The team reviewed the retry fix again this week, and the retry fix still held.",
  ].join(" ");
  const stats = computeTextStats(text);
  const distinctiveRank = stats.topWords.indexOf("retry");
  const genericRank = stats.topWords.indexOf("week");
  assert.ok(distinctiveRank !== -1);
  assert.ok(genericRank === -1 || distinctiveRank < genericRank);
});

test("topWords filters out words that are usually capitalized mid-sentence (topic/proper nouns, not word choices)", () => {
  const text = [
    "We migrated the retry logic onto Kubernetes last quarter.",
    "Running everything on Kubernetes cut our on-call load in half.",
    "The team now trusts Kubernetes with every retry attempt.",
  ].join(" ");
  const stats = computeTextStats(text);
  assert.ok(!stats.topWords.includes("kubernetes"), "a mostly-capitalized topic entity should not read as a distinctive word choice");
  assert.ok(stats.topWords.includes("retry"), "an ordinary lowercase recurring word should still surface");
});

test("mergeStats with a single sample returns it unchanged", () => {
  const stats = computeTextStats("Some sample text here for testing purposes only.");
  const merged = mergeStats([stats]);
  assert.deepEqual(merged, stats);
});

test("mergeStats weights averaged metrics by each sample's word count", () => {
  const short = computeTextStats("Short. Text.");
  const long = computeTextStats(
    "This is a considerably longer sample with many more words in every sentence, on purpose, to dominate the weighted average by sheer word count."
  );
  const merged = mergeStats([short, long]);
  assert.equal(merged.wordCount, short.wordCount + long.wordCount);
  // avgSentenceLength should be pulled toward the longer (higher-weight) sample
  const midpoint = (short.avgSentenceLength + long.avgSentenceLength) / 2;
  assert.ok(Math.abs(merged.avgSentenceLength - long.avgSentenceLength) <
    Math.abs(merged.avgSentenceLength - midpoint) ||
    long.wordCount === short.wordCount);
});

test("mergeStats ranks a word/bigram present in more samples above one present in only one sample", () => {
  const sampleA = computeTextStats("Priya flagged the retry issue twice. The retry issue mattered to Priya.");
  const sampleB = computeTextStats("The retry issue came back Friday. Priya was right about the retry issue.");
  const sampleC = computeTextStats("Budget review went fine. Nothing unusual in the budget review this time.");
  const merged = mergeStats([sampleA, sampleB, sampleC]);

  // "retry"/"retry issue" show up in 2 of 3 samples; "budget review" only in 1.
  assert.ok(merged.topWords.includes("retry"));
  assert.ok(merged.topBigrams.includes("retry issue"));
  const retryWordRank = merged.topWords.indexOf("retry");
  const budgetWordRank = merged.topWords.indexOf("budget");
  const retryBigramRank = merged.topBigrams.indexOf("retry issue");
  const budgetBigramRank = merged.topBigrams.indexOf("budget review");
  assert.ok(budgetWordRank === -1 || retryWordRank < budgetWordRank);
  assert.ok(budgetBigramRank === -1 || retryBigramRank < budgetBigramRank);
});

test("describeStats mentions long sentences when avgSentenceLength is high", () => {
  const stats = computeTextStats(
    "This sentence intentionally runs on for quite a long while so that the average sentence length measured across the sample comfortably clears the twenty word threshold used by the description heuristic."
  );
  const description = describeStats(stats);
  assert.match(description, /sentences run long/i);
});

test("describeStats mentions short sentences when avgSentenceLength is low", () => {
  const stats = computeTextStats("Go. Stop. Wait. Now. Run. Fine. OK. Yes.");
  const description = describeStats(stats);
  assert.match(description, /sentences run short/i);
});

test("describeStats surfaces fragment and question observations only above threshold", () => {
  const withFragments = computeTextStats(
    "Fine. Fine. Fine. Fine. This one sentence right here is deliberately long enough to keep the fragment rate from being one hundred percent while still clearing the eight percent fragment threshold used by the heuristic."
  );
  const description = describeStats(withFragments);
  assert.match(description, /fragments/i);
});

test("describeStats surfaces recurring phrasing when topBigrams is non-empty", () => {
  const stats = computeTextStats(
    "risk management matters here. risk management is hard to get right. risk management pays off."
  );
  const description = describeStats(stats);
  assert.match(description, /recurring phrasing/i);
});

test("describeStats surfaces distinctive word choices when topWords is non-empty and sampleCount clears the minimum", () => {
  const stats = computeTextStats(
    "Priya flagged the retry issue. The retry issue came back Friday. Priya was right about the retry issue."
  );
  assert.doesNotMatch(describeStats(stats), /distinctive word choices/i, "no sampleCount given defaults to gated off");
  assert.doesNotMatch(describeStats(stats, 2), /distinctive word choices/i, "two samples is still below the minimum");
  assert.match(describeStats(stats, 3), /distinctive word choices/i);
});

test("structuralEntropy rewards varied sentence openers and punctuation variety over repetitive uniform structure", () => {
  const uniform = computeTextStats(
    "The plan works well. The team agrees on it. The budget holds steady. The timeline stays set."
  );
  const varied = computeTextStats(
    "The plan works; nobody argues that. Still, questions remain (mostly about budget). Will the timeline hold? Maybe not — but that's fine for now."
  );
  assert.ok(varied.structuralEntropy > uniform.structuralEntropy);
});

test("structuralEntropy is 0 for a single-sentence, plain-punctuation sample", () => {
  const stats = computeTextStats("This is one plain sentence with nothing unusual in it.");
  assert.equal(stats.structuralEntropy, 0);
});

test("describeStats always appends an entropy-driven structure line", () => {
  const tidy = describeStats(
    computeTextStats("The plan works. The team agrees. The budget holds. The timeline is set.")
  );
  const loose = describeStats(
    computeTextStats(
      "The plan works; nobody argues that. Still, questions remain (mostly about budget). Will the timeline hold? Maybe not — but that's fine for now."
    )
  );
  assert.notEqual(tidy, loose);
});
