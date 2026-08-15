import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STRUCTURAL_PATTERNS,
  computeWholePieceMetrics,
  detectWholePieceRhythm,
  computeStrengthSignals,
} from "./structural-detectors.js";

function countMatches(id: string, text: string): number {
  const pattern = STRUCTURAL_PATTERNS.find((p) => p.id === id);
  assert.ok(pattern, `no STRUCTURAL_PATTERNS entry with id "${id}"`);
  const re = new RegExp(pattern!.regex.source, pattern!.regex.flags);
  return text.match(re)?.length ?? 0;
}

const cases: Array<{ id: string; positive: string; negative: string }> = [
  {
    id: "no-triple",
    positive: "No cutting corners. No shortcuts. No excuses.",
    negative: "No, that's not right, but it's fine either way.",
  },
  {
    id: "all-none",
    positive: "All the excitement. None of the substance.",
    negative: "All the reports were filed on time. That's normal here.",
  },
  {
    id: "negative-listing",
    positive: "Not a hobby. Not a phase. A calling.",
    negative: "Not a bad idea, honestly, but we should wait and see.",
  },
  {
    id: "elevation-echo",
    positive: "It's not just a tool, it's a movement.",
    negative: "It's not a tool. It's broken.",
  },
  {
    id: "stop-start",
    positive: "Stop guessing. Start measuring.",
    negative: "Stop right there, please.",
  },
  {
    id: "not-only-but-also",
    positive: "It was not only fast but also reliable.",
    negative: "It was fast and reliable.",
  },
  {
    id: "at-its-core",
    positive: "At its core, this is about trust.",
    negative: "At the core of the engine there's a turbine.",
  },
  {
    id: "more-you-less-you",
    positive: "The more you practice, the less you fear failure.",
    negative: "The more you practice, the better you get.",
  },
  {
    id: "thats-where-comes-in",
    positive: "That's where automation comes in.",
    negative: "That is where we live now.",
  },
  {
    id: "not-all-created-equal",
    positive: "Not all diets are created equal.",
    negative: "Not all diets work the same way.",
  },
  {
    id: "most-people-believe-wrong",
    positive: "Most people believe exercise burns fat fast. They're wrong.",
    negative: "Most people think exercise helps. That's true.",
  },
  {
    id: "studies-show-percent",
    positive: "Studies show that 73% of readers skim.",
    negative: "Studies show that most readers skim.",
  },
  {
    id: "vague-authority-attribution",
    positive: "Industry experts agree that the shift is already underway.",
    negative: "Priya, who's run the platform team for six years, thinks the shift is already underway.",
  },
  {
    id: "participial-tail-abstract",
    positive: "We shipped the fix, underscoring our commitment to reliability.",
    negative: "We shipped the fix, hoping it would hold.",
  },
  {
    id: "em-dash-rate",
    positive: "This is the plan — start today.",
    negative: "This is the plan, start today.",
  },
  {
    id: "ai-utm-source",
    positive: "See https://example.com/article?utm_source=chatgpt.com for details.",
    negative: "See https://example.com/article?utm_source=newsletter for details.",
  },
  {
    id: "ai-citation-markup",
    positive: "See details citeturn0search3 for more.",
    negative: "Please cite your sources properly.",
  },
  {
    id: "cutoff-disclaimer",
    positive: "As of my last update, I don't have new data.",
    negative: "As of March, sales were up sharply.",
  },
  {
    id: "ai-placeholder",
    positive: "Dear [Your Name], thanks for reaching out.",
    negative: "Dear Sam, thanks for reaching out.",
  },
  {
    id: "formulaic-opener",
    positive: "In the rapidly evolving landscape of AI, businesses must adapt.",
    negative: "In the world of AI, businesses must adapt.",
  },
  {
    id: "hedge-stack",
    positive: "This could potentially change everything.",
    negative: "This could change everything.",
  },
  {
    id: "to-name-a-few",
    positive: "Budget, timeline, and scope all shifted, to name a few.",
    negative: "Priya's name is on the door, and she earned it.",
  },
  {
    id: "parenthetical-hedge",
    positive: "The results were strong (and increasingly, replicable across cohorts).",
    negative: "The results were strong (see appendix for details).",
  },
  {
    id: "category-contrast-positioning",
    positive: "Most AI writing tools optimize for polish. This one optimizes for sounding like you.",
    negative: "Most readers skim past the header. That's fine, the real content starts below.",
  },
  {
    id: "bulleted-bold-term",
    positive: "- **Speed:** It's incredibly fast.\n- **Reliability:** It rarely breaks.",
    negative: "- Speed: it's incredibly fast, no bold markdown here.",
  },
  {
    id: "markdown-heading-leak",
    positive: "## Getting Started\n\nSome body text follows the heading.",
    negative: "This sentence mentions a #hashtag but is not a heading.",
  },
  {
    id: "markdown-bold-in-prose",
    positive: "This approach is **significantly better** than the alternative.",
    negative: "This approach is significantly better than the alternative.",
  },
  {
    id: "emoji-bullet-scaffolding",
    positive: "🚀 Ship faster than ever.\n💡 Great ideas start here.",
    negative: "Regular text with no leading emoji at all.",
  },
];

for (const { id, positive, negative } of cases) {
  test(`structural pattern "${id}" matches its positive example`, () => {
    assert.ok(countMatches(id, positive) >= 1, `expected a match in: ${positive}`);
  });
  test(`structural pattern "${id}" does not match its negative example`, () => {
    assert.equal(countMatches(id, negative), 0, `expected no match in: ${negative}`);
  });
}

test('negative-listing also matches the past-tense "It wasn\'t X. It wasn\'t Y. It was Z." variant', () => {
  const text = "It wasn't luck. It wasn't timing. It was preparation.";
  assert.ok(countMatches("negative-listing", text) >= 1);
});

test("negative-listing leaves a single negation unmatched (regression)", () => {
  const text = "Not a bad idea, honestly, but we should wait and see.";
  assert.equal(countMatches("negative-listing", text), 0);
});

test('elevation-echo also matches the "None of this is X. It\'s Y." structural variant', () => {
  const text = "None of this is about cutting corners. It's about cutting the waiting.";
  assert.ok(countMatches("elevation-echo", text) >= 1);
});

test('elevation-echo matches the "isn\'t just" contraction form', () => {
  const text = "This isn't just a solution, it's a transformation.";
  assert.ok(countMatches("elevation-echo", text) >= 1);
});

test("elevation-echo still leaves a bare correction unmatched (regression)", () => {
  const text = "It's not a tool. It's broken.";
  assert.equal(countMatches("elevation-echo", text), 0);
});

test("vague-authority-attribution also matches the research/reports branch", () => {
  const text = "Research shows that most teams underestimate this cost.";
  assert.ok(countMatches("vague-authority-attribution", text) >= 1);
});

test("vague-authority-attribution also matches the observers-note branch", () => {
  const text = "Observers note that adoption has been slower than expected.";
  assert.ok(countMatches("vague-authority-attribution", text) >= 1);
});

test("title-case-header matches a title-case-only line", () => {
  const text = "Some intro text.\n\nGetting Started With Automation\n\nMore body text follows here.";
  assert.ok(countMatches("title-case-header", text) >= 1);
});

test("title-case-header does not match an ordinary sentence line", () => {
  const text = "This is a normal lowercase sentence on its own line.";
  assert.equal(countMatches("title-case-header", text), 0);
});

test("computeWholePieceMetrics reports low CV for uniform paragraphs/sentences", () => {
  const para = "Short sentence here now. Short sentence here too.";
  const text = [para, para, para, para].join("\n\n");
  const metrics = computeWholePieceMetrics(text);
  assert.equal(metrics.paragraphCount, 4);
  assert.ok(metrics.paragraphLengthUniformity < 0.35);
  assert.ok(metrics.sentenceBurstiness < 0.35);
});

test("detectWholePieceRhythm flags uniform paragraph length and low burstiness together", () => {
  const para = "Short sentence here now. Short sentence here too.";
  const text = [para, para, para, para].join("\n\n");
  const findings = detectWholePieceRhythm(text);
  const ids = findings.map((f) => f.id);
  assert.ok(ids.includes("uniform-paragraph-length"));
  assert.ok(ids.includes("low-burstiness"));
});

test("detectWholePieceRhythm stays quiet on varied paragraph/sentence shape", () => {
  const text = [
    "One line.",
    "This paragraph runs considerably longer, mixing a short beat with a much longer sentence that keeps going for a while before it lands, and then adds one more short one after it. Short one.",
    "Medium length paragraph with two sentences. The second sentence here is a bit longer than the first one was.",
  ].join("\n\n");
  const findings = detectWholePieceRhythm(text);
  assert.equal(findings.length, 0);
});

test("detectWholePieceRhythm requires at least 4 paragraphs before flagging uniformity", () => {
  const para = "Short sentence here now. Short sentence here too.";
  const text = [para, para, para].join("\n\n");
  const findings = detectWholePieceRhythm(text);
  assert.ok(!findings.some((f) => f.id === "uniform-paragraph-length"));
});

test("register-calibrated threshold catches moderate uniformity the generic 0.35 cutoff misses", () => {
  // Sentence-length CV ~0.42: above the generic 0.35 cutoff (so it reads as
  // "varied enough" for any unspecified register) but below the "docs"
  // register's calibrated threshold (baseline mean 0.666, stdev 0.189, so
  // ~0.55), because real docs prose runs far more varied than 0.35 implies.
  const lens = [8, 8, 8, 8, 14, 14, 4, 4];
  const text = lens
    .map((n) => ["Term", ...Array.from({ length: n - 1 }, (_, i) => `term${i + 1}`)].join(" ") + ".")
    .join(" ");
  const metrics = computeWholePieceMetrics(text);
  assert.ok(metrics.sentenceBurstiness > 0.35 && metrics.sentenceBurstiness < 0.5, "fixture should sit between the generic and docs thresholds");

  assert.equal(detectWholePieceRhythm(text).length, 0, "no register: reads as varied enough");
  const docsFindings = detectWholePieceRhythm(text, "docs");
  assert.ok(docsFindings.some((f) => f.id === "low-burstiness"), "docs register: below this register's real baseline, should flag");
});

test("mechanical-register-drift fires on fragment-rate/entropy drift for docs register only, above the sentence-count floor", () => {
  const lens = [8, 8, 8, 8, 14, 14, 4, 4];
  const text = lens
    .map((n) => ["Term", ...Array.from({ length: n - 1 }, (_, i) => `term${i + 1}`)].join(" ") + ".")
    .join(" ");
  assert.ok(!detectWholePieceRhythm(text).some((f) => f.id === "mechanical-register-drift"));
  assert.ok(detectWholePieceRhythm(text, "docs").some((f) => f.id === "mechanical-register-drift"));
});

test("the 'blog' register's own calibrated threshold (baseline mean 0.647, stdev 0.176, so ~0.54) also catches moderate uniformity the generic 0.35 cutoff misses, independently of docs's threshold", () => {
  const lens = [8, 8, 8, 8, 14, 14, 4, 4];
  const text = lens
    .map((n) => ["Term", ...Array.from({ length: n - 1 }, (_, i) => `term${i + 1}`)].join(" ") + ".")
    .join(" ");
  assert.equal(detectWholePieceRhythm(text).length, 0, "no register: reads as varied enough");
  const blogFindings = detectWholePieceRhythm(text, "blog");
  assert.ok(blogFindings.some((f) => f.id === "low-burstiness"), "blog register: below this register's own real baseline, should flag");
  assert.ok(blogFindings.some((f) => f.id === "mechanical-register-drift"), "blog register: fragment-rate/entropy drift also fires using blog's own baseline");
});

test("the 'memo' register's own calibrated threshold (baseline mean 0.781, stdev 0.197, so ~0.66) also catches moderate uniformity the generic 0.35 cutoff misses, independently of docs's and blog's thresholds", () => {
  const lens = [8, 8, 8, 8, 14, 14, 4, 4];
  const text = lens
    .map((n) => ["Term", ...Array.from({ length: n - 1 }, (_, i) => `term${i + 1}`)].join(" ") + ".")
    .join(" ");
  assert.equal(detectWholePieceRhythm(text).length, 0, "no register: reads as varied enough");
  const memoFindings = detectWholePieceRhythm(text, "memo");
  assert.ok(memoFindings.some((f) => f.id === "low-burstiness"), "memo register: below this register's own real baseline, should flag");
  assert.ok(memoFindings.some((f) => f.id === "mechanical-register-drift"), "memo register: fragment-rate/entropy drift also fires using memo's own baseline");
});

test("the 'essay' register's own calibrated threshold (baseline mean 0.668, stdev 0.167, so ~0.57) also catches moderate uniformity the generic 0.35 cutoff misses, independently of the other three registers' thresholds", () => {
  const lens = [8, 8, 8, 8, 14, 14, 4, 4];
  const text = lens
    .map((n) => ["Term", ...Array.from({ length: n - 1 }, (_, i) => `term${i + 1}`)].join(" ") + ".")
    .join(" ");
  assert.equal(detectWholePieceRhythm(text).length, 0, "no register: reads as varied enough");
  const essayFindings = detectWholePieceRhythm(text, "essay");
  assert.ok(essayFindings.some((f) => f.id === "low-burstiness"), "essay register: below this register's own real baseline, should flag");
  assert.ok(essayFindings.some((f) => f.id === "mechanical-register-drift"), "essay register: fragment-rate/entropy drift also fires using essay's own baseline");
});

test("'email' deliberately has no REGISTER_MECHANICAL_BASELINES entry: a calibrated baseline was tried and measurably made pooled AUC worse (0.540 -> 0.497) against a labeled email corpus, not better, so register: 'email' falls through to the generic threshold same as no register at all (regression: a future edit that adds one back should re-verify against that finding first, see src/data/SOURCES.md's 2026-08-10 email entry)", () => {
  const lens = [8, 8, 8, 8, 14, 14, 4, 4];
  const text = lens
    .map((n) => ["Term", ...Array.from({ length: n - 1 }, (_, i) => `term${i + 1}`)].join(" ") + ".")
    .join(" ");
  assert.deepEqual(detectWholePieceRhythm(text, "email"), detectWholePieceRhythm(text), "email register should behave identically to no register: no calibrated baseline exists for it");
});

test("'general' deliberately has no REGISTER_MECHANICAL_BASELINES entry: docs/blog/memo/essay's own calibrated baselines are measurably different from each other (sentenceLengthCV 0.666/0.647/0.781/0.668), so any single 'general' baseline would be an arbitrary blend of four different real populations rather than a real fifth one, see src/data/SOURCES.md's 2026-08-10 general entry", () => {
  const lens = [8, 8, 8, 8, 14, 14, 4, 4];
  const text = lens
    .map((n) => ["Term", ...Array.from({ length: n - 1 }, (_, i) => `term${i + 1}`)].join(" ") + ".")
    .join(" ");
  assert.deepEqual(detectWholePieceRhythm(text, "general"), detectWholePieceRhythm(text), "general register should behave identically to no register: no calibrated baseline exists for it");
});

// ---------------------------------------------------------------------------
// D1 · self-describing-structure (etincel-human-signal-spec.md Part 2).
// SCAFFOLDED_LETTER below is long enough (>250 words) to clear the piece
// floor, and mirrors the spec's own worked example: a standalone paragraph
// announcing "three parts" (family A), followed by three paragraphs each
// opening on a bare "label, ordinal." fragment (family B).

const SCAFFOLDED_LETTER = [
  "I am writing to express my sincere interest in the VP of Foundation role at your organization, a position I have followed closely for some time and one I believe represents an excellent fit for my background and experience. Over the past decade I have built a proven track record of leading ambitious, high-impact fundraising campaigns across the nonprofit and cultural sectors, and I believe my professional background and demonstrated results align closely with what you are looking for in this critical leadership position at this pivotal moment for your foundation's next chapter of sustained growth and impact across the wider community.",
  "Three parts of my track record speak directly to your requirements.",
  "Major gifts, first. At my current organization I led a comprehensive campaign that raised $3.4M against a $2.5M target, a 53% increase over the prior fiscal cycle, working closely with board members and major donors including Ubisoft and several other corporate partners across the region and beyond, over a period of roughly eighteen months.",
  "Partnerships and brand, second. I built the brand strategy that grew our corporate partnership program by 130% year over year, securing multi-year commitments from organizations across the region and establishing a repeatable, scalable playbook for sustained future growth across every channel we operate in today.",
  "Building, last. I founded and scaled the development function from a single contractor to a five-person team, closing our first CFRE-certified staff hire within the first year and delivering consistent, measurable year-over-year growth across every program area and initiative we launched together.",
].join("\n\n");

const PLAIN_LETTER = [
  "I want to tell you about my son before I tell you about my resume, because the second thing only makes sense in light of the first, and I promise I will get there eventually, once I have explained why.",
  "He has been on skates since he was three, not because we were serious hockey people, not even close. The rink was cold most mornings and mostly empty, and the coach's name was Dave, and Dave believed in him before there was much evidence yet to believe in.",
  "I have spent the years since then in development roles at three different organizations, and I would be lying if I said every campaign went the way I had planned it to go, because several of them plainly did not.",
  "I am telling you this because building a campaign from almost nothing, the way I did at my last job, is honestly what I am best at, and I would like to bring that same instinct to your foundation if you will have me.",
].join("\n\n");

test("detectWholePieceRhythm flags self-describing-enumeration on a standalone paragraph announcing a count, at confidence red", () => {
  const findings = detectWholePieceRhythm(SCAFFOLDED_LETTER, "general");
  const finding = findings.find((f) => f.id === "self-describing-enumeration");
  assert.ok(finding, "expected self-describing-enumeration to fire");
  assert.equal(finding.confidence, "red");
  assert.equal(finding.severity, "high");
});

test("detectWholePieceRhythm flags self-describing-ordinal-scaffold when 2+ paragraphs open on a label-fragment or bare ordinal, at confidence orange", () => {
  const findings = detectWholePieceRhythm(SCAFFOLDED_LETTER, "general");
  const finding = findings.find((f) => f.id === "self-describing-ordinal-scaffold");
  assert.ok(finding, "expected self-describing-ordinal-scaffold to fire");
  assert.equal(finding.confidence, "orange");
  assert.equal(finding.severity, "medium");
});

test("detectWholePieceRhythm does not flag self-describing-structure on ordinary human-shaped prose of comparable length", () => {
  const findings = detectWholePieceRhythm(PLAIN_LETTER, "general");
  assert.ok(!findings.some((f) => f.id === "self-describing-enumeration"));
  assert.ok(!findings.some((f) => f.id === "self-describing-ordinal-scaffold"));
});

test("self-describing-enumeration requires the ≥250-word piece floor: a lone short paragraph matching the shape doesn't fire on its own", () => {
  const short = "I have a few things to do today, and none of them are especially urgent.";
  assert.ok(!detectWholePieceRhythm(short, "general").some((f) => f.id === "self-describing-enumeration"));
});

test("self-describing-enumeration requires BOTH the enumeration phrase and a self/document reference in the same standalone paragraph", () => {
  // Long enough to clear the word floor via padding paragraphs, but the
  // enumeration paragraph itself has no self/document-reference token, so
  // it should not fire: this is the exact false positive the spec's own
  // testing caught ("I have a few things to do today" with no gate at all).
  const padding = Array.from({ length: 4 }, () =>
    "This paragraph exists only to push the piece above the two-hundred-fifty word floor so the test isolates the announced-enumeration check itself rather than the floor."
  );
  const text = [...padding, "There are two ways to read this situation, honestly."].join("\n\n");
  assert.ok(!detectWholePieceRhythm(text, "general").some((f) => f.id === "self-describing-enumeration"));
});

test("self-describing-ordinal-scaffold requires at least 2 matching paragraphs: a single one is unremarkable prose", () => {
  const padding = Array.from({ length: 4 }, () =>
    "This paragraph exists only to push the piece above the two-hundred-fifty word floor so the test isolates the ordinal-scaffold check on its own terms."
  );
  const text = [...padding, "Major gifts, first. This is the only paragraph here shaped like a label fragment."].join(
    "\n\n"
  );
  assert.ok(!detectWholePieceRhythm(text, "general").some((f) => f.id === "self-describing-ordinal-scaffold"));
});

test("self-describing-ordinal-scaffold is suppressed for docs, memo, essay, and blog (numbered structure is the correct form there; essay's and blog's suppressions were added after measuring real regressions on RFC/PEP and Rust release-note content, see the comment at the suppression's call site), but not general", () => {
  assert.ok(!detectWholePieceRhythm(SCAFFOLDED_LETTER, "docs").some((f) => f.id === "self-describing-ordinal-scaffold"));
  assert.ok(!detectWholePieceRhythm(SCAFFOLDED_LETTER, "memo").some((f) => f.id === "self-describing-ordinal-scaffold"));
  assert.ok(!detectWholePieceRhythm(SCAFFOLDED_LETTER, "essay").some((f) => f.id === "self-describing-ordinal-scaffold"));
  assert.ok(!detectWholePieceRhythm(SCAFFOLDED_LETTER, "blog").some((f) => f.id === "self-describing-ordinal-scaffold"));
  assert.ok(detectWholePieceRhythm(SCAFFOLDED_LETTER, "general").some((f) => f.id === "self-describing-ordinal-scaffold"));
});

test("self-describing-enumeration is NOT suppressed for docs/memo: only family B (ordinal scaffold) is register-gated, per the spec", () => {
  assert.ok(detectWholePieceRhythm(SCAFFOLDED_LETTER, "docs").some((f) => f.id === "self-describing-enumeration"));
  assert.ok(detectWholePieceRhythm(SCAFFOLDED_LETTER, "memo").some((f) => f.id === "self-describing-enumeration"));
});

test("D1 family C (narrated intent) fires as a flat STRUCTURAL_PATTERNS entry, not a whole-piece finding", () => {
  const withIntent = "Let me walk you through how this works before we get into the details of the plan.";
  const detected = STRUCTURAL_PATTERNS.find((p) => p.id === "narrated-intent-scaffold");
  assert.ok(detected);
  detected.regex.lastIndex = 0;
  assert.ok(detected.regex.test(withIntent));
  detected.regex.lastIndex = 0;
  assert.ok(!detected.regex.test("I walked to the store and back before dinner."));
});

test("computeStrengthSignals rates named, numbered detail as more specific and more grounded than generic abstraction", () => {
  const specific =
    "Priya shipped the fix on March 19, 2026. Q3 renewal came in at 94%, three points ahead of plan. The team closed 12 tickets in Boston before Friday.";
  const abstract =
    "The implementation demonstrated significant improvement in overall functionality, reflecting a commitment to operational excellence and organizational effectiveness.";
  const specificSignals = computeStrengthSignals(specific);
  const abstractSignals = computeStrengthSignals(abstract);
  assert.ok(specificSignals.specificityPer1000Words > abstractSignals.specificityPer1000Words);
  assert.ok(specificSignals.concreteAbstractRatio > abstractSignals.concreteAbstractRatio);
});

test("computeStrengthSignals's sentenceBurstiness is the same coefficient-of-variation signal as computeWholePieceMetrics", () => {
  const text = [
    "One line.",
    "This paragraph runs considerably longer, mixing a short beat with a much longer sentence that keeps going for a while before it lands, and then adds one more short one after it. Short one.",
  ].join("\n\n");
  const { sentenceBurstiness } = computeStrengthSignals(text);
  assert.equal(sentenceBurstiness, computeWholePieceMetrics(text).sentenceBurstiness);
});

test("computeStrengthSignals surfaces no notes when nothing actually clears a threshold", () => {
  const flat = "The plan involves the situation. The team reviews the outcome. The group discusses the process. The staff notes the result.";
  assert.deepEqual(computeStrengthSignals(flat).notes, []);
});

test("computeStrengthSignals notes specificity and groundedness for dense, named detail", () => {
  const dense =
    "Priya, Sam, and Marcus closed 14 tickets across Boston, Denver, and Reno on March 3, hitting 118% of the Q2 target set on January 9.";
  const notes = computeStrengthSignals(dense).notes;
  assert.ok(notes.some((n) => /specific/i.test(n)));
  assert.ok(notes.some((n) => /grounded/i.test(n)));
});
