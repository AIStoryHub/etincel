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
