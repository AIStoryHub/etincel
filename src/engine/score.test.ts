import { test } from "node:test";
import assert from "node:assert/strict";
import { auditText } from "./score.js";
import { detectWholePieceRhythm } from "./structural-detectors.js";

test("empty input returns a zeroed, green result", () => {
  const result = auditText("");
  assert.equal(result.score, 0);
  assert.equal(result.tier, "green");
  assert.equal(result.wordCount, 0);
  assert.deepEqual(result.findings, []);
  assert.equal(result.summary, "Empty input.");
  assert.deepEqual(result.strengths, { specificityPer1000Words: 0, concreteAbstractRatio: 0, sentenceBurstiness: 0, notes: [] });
});

test("auditText surfaces a strengths signal alongside the deductions (regression: the audit used to only ever subtract)", () => {
  const result = auditText(
    "Priya shipped the fix on March 19, 2026. Q3 renewal came in at 94%, three points ahead of plan."
  );
  assert.ok(result.strengths.specificityPer1000Words > 0);
  assert.ok(result.strengths.notes.length > 0);
});

test("whitespace-only input is treated as empty", () => {
  const result = auditText("   \n\t  ");
  assert.equal(result.wordCount, 0);
  assert.equal(result.score, 0);
});

test("clean, varied prose scores green with no findings", () => {
  const text = [
    "I missed the deadline. Not by a little.",
    "We'd promised March 1st and shipped March 19th, and the extra time didn't even fix the bug we were chasing. What fixed it was Priya noticing the retry logic was silently swallowing errors, which took her about ten minutes once she actually looked.",
    "So the lesson wasn't about process. It was about where we'd been looking.",
  ].join("\n\n");
  const result = auditText(text);
  assert.equal(result.tier, "green");
  assert.equal(result.findings.length, 0);
});

test("a hard-ban verb is flagged as a red, high-severity, always-scored finding", () => {
  const text = "We need to leverage our existing partnerships to grow.";
  const result = auditText(text);
  const finding = result.findings.find((f) => f.term === "leverage");
  assert.ok(finding, "expected a finding for 'leverage'");
  assert.equal(finding!.category, "verb");
  assert.equal(finding!.confidence, "red");
  assert.equal(finding!.severity, "high");
  assert.equal(finding!.scored, true);
  assert.equal(finding!.replacementHint, "use");

  assert.equal(finding!.matches?.length, 1);
  const { start, end } = finding!.matches![0];
  assert.equal(text.slice(start, end).toLowerCase(), "leverage");
});

test("matches carries one offset pair per occurrence, in text order, locating the exact match text", () => {
  const text = "We should leverage this. Let's leverage that opportunity too.";
  const result = auditText(text);
  const finding = result.findings.find((f) => f.term === "leverage");
  assert.ok(finding);
  assert.equal(finding!.matches?.length, 2);
  for (const { start, end } of finding!.matches!) {
    assert.equal(text.slice(start, end).toLowerCase(), "leverage");
  }
  assert.ok(finding!.matches![0].start < finding!.matches![1].start, "expected matches in text order");
});

test("whole-piece rhythm findings omit matches (no single span to locate)", () => {
  const para = "Short sentence here now. Short sentence here too.";
  const text = [para, para, para, para].join("\n\n");
  const result = auditText(text);
  const rhythmFinding = result.findings.find((f) => f.category === "Whole-piece rhythm");
  assert.ok(rhythmFinding);
  assert.equal(rhythmFinding!.matches, undefined);
});

test("a soft-flag term is context-dependent: found but not scored on a single occurrence, scored once it recurs", () => {
  const once = auditText(
    "On the other hand, the board's decision changed how we plan quarterly reviews."
  );
  const singleFinding = once.findings.find((f) => f.term === "on the other hand");
  assert.ok(singleFinding, "expected a finding for 'on the other hand' even on a single occurrence");
  assert.equal(singleFinding!.confidence, "orange");
  assert.equal(singleFinding!.scored, false);

  const twice = auditText(
    "On the other hand, the board changed course. On the other hand, so did the budget."
  );
  const repeatedFinding = twice.findings.find((f) => f.term === "on the other hand");
  assert.ok(repeatedFinding);
  assert.equal(repeatedFinding!.count, 2);
  assert.equal(repeatedFinding!.scored, true);
});

test("'to name a few' flags the verb-form list-closer idiom without touching 'name' as a noun", () => {
  const verbForm = auditText("Budget, timeline, and scope all shifted, to name a few.");
  assert.ok(verbForm.findings.some((f) => f.term.includes('"Name" used as a verb')));

  const nounForm = auditText("Priya signed her name on the form and filed it under the company name.");
  assert.ok(!nounForm.findings.some((f) => f.term.toLowerCase().includes("name")));
});

test("'shape' as an abstract verb (shapes/shaping/shaped/will shape) is flagged; 'shape' as a literal noun is not", () => {
  const verbForms = [
    "This decision shapes how the whole team thinks about risk.",
    "The offsite ended up shaping the roadmap for next quarter.",
    "Our early failures shaped how we approach every launch since.",
    "This partnership will shape the industry for years to come.",
  ];
  for (const text of verbForms) {
    const result = auditText(text);
    assert.ok(
      result.findings.some((f) => f.term.toLowerCase().includes("shap")),
      `expected a shape-as-verb finding for: ${text}`
    );
  }

  const nounForms = [
    "Priya bent the wire into a rough shape and called it done.",
    "We need to get in shape before the season starts.",
  ];
  for (const text of nounForms) {
    const result = auditText(text);
    assert.ok(
      !result.findings.some((f) => f.term.toLowerCase().includes("shap")),
      `expected no shape finding for literal use: ${text}`
    );
  }
});

test("a yellow-confidence structural pattern only scores once it repeats", () => {
  const oneHeader = "Intro text.\n\nGetting Started With Automation\n\nBody text follows.";
  const single = auditText(oneHeader);
  const singleTitleFinding = single.findings.find((f) => f.confidence === "yellow");
  assert.ok(singleTitleFinding, "expected the pattern to be detected even once");
  assert.equal(singleTitleFinding!.scored, false);

  const twoHeaders =
    "Intro text.\n\nGetting Started With Automation\n\nMiddle text.\n\nFinal Thoughts And Next Steps\n\nBody text follows.";
  const doubled = auditText(twoHeaders);
  const doubledTitleFinding = doubled.findings.find((f) => f.confidence === "yellow");
  assert.ok(doubledTitleFinding);
  assert.equal(doubledTitleFinding!.count, 2);
  assert.equal(doubledTitleFinding!.scored, true);
});

test("heavily AI-styled text lands in the red tier", () => {
  const slop = `In today's rapidly evolving landscape of technology, it is worth noting that many experts agree that leveraging cutting-edge solutions can unlock a myriad of opportunities. Furthermore, organizations that embrace this transformative journey will find themselves well-positioned for success. Moreover, the benefits are seamless, robust, and holistic. As an AI language model, I don't have access to real-time data, but I hope this helps!`;
  const result = auditText(slop);
  assert.equal(result.tier, "red");
  assert.ok(result.score >= 55);
});

test("categoryBreakdown aggregates finding counts per category, sorted descending", () => {
  const text = "We should leverage and utilize and harness every opportunity to leverage more.";
  const result = auditText(text);
  const verbCategory = result.categoryBreakdown.find((c) => c.category === "verb");
  assert.ok(verbCategory);
  for (let i = 1; i < result.categoryBreakdown.length; i++) {
    assert.ok(result.categoryBreakdown[i - 1].count >= result.categoryBreakdown[i].count);
  }
});

test("scored findings sort before unscored findings", () => {
  const twoHeaders =
    "Intro text.\n\nGetting Started With Automation\n\nMiddle text.\n\nFinal Thoughts And Next Steps\n\nWe leverage this daily.";
  const result = auditText(twoHeaders);
  const firstUnscoredIndex = result.findings.findIndex((f) => !f.scored);
  if (firstUnscoredIndex !== -1) {
    for (let i = 0; i < firstUnscoredIndex; i++) {
      assert.equal(result.findings[i].scored, true);
    }
  }
});

test("rhythm findings add exactly 6 points per finding when vocabulary is otherwise clean", () => {
  const para = "Short sentence here now. Short sentence here too.";
  const text = [para, para, para, para].join("\n\n");
  const rhythmFindings = detectWholePieceRhythm(text);
  assert.ok(rhythmFindings.length > 0, "test text should trigger rhythm findings");

  const result = auditText(text);
  const nonRhythmFindings = result.findings.filter((f) => f.category !== "Whole-piece rhythm");
  assert.equal(
    nonRhythmFindings.length,
    0,
    "expected no vocabulary/structural findings in this plain-word repeated text"
  );
  assert.equal(result.score, rhythmFindings.length * 6);
});

test("assistant-chrome phrases are caught even when nothing else in the text is a tell", () => {
  const result = auditText(
    "The migration finished ahead of schedule and every check passed. I hope this helps!"
  );
  const finding = result.findings.find((f) => f.term === "i hope this helps!");
  assert.ok(finding, "expected the standalone chatbot sign-off to be flagged on its own");
  assert.equal(finding!.confidence, "red");
  assert.equal(finding!.scored, true);
});

test("sycophantic-opener phrases are caught in isolation (regression: previously undetected assistant-chrome gap)", () => {
  const result = auditText("Great question! You're absolutely right that timing matters here.");
  const terms = result.findings.map((f) => f.term);
  assert.ok(terms.includes("great question!"));
  assert.ok(terms.includes("you're absolutely right"));
});

test("hollow corporate-reassurance phrasing is caught (regression: previously scored green)", () => {
  const result = auditText(
    "We're writing to inform you that, due to unforeseen circumstances, the launch timeline has been adjusted. Rest assured, our team is working tirelessly to ensure a smooth rollout. We appreciate your patience and understand any inconvenience this may cause."
  );
  const terms = result.findings.map((f) => f.term);
  assert.ok(terms.includes("rest assured"));
  assert.ok(terms.includes("working tirelessly"));
  assert.ok(terms.includes("we appreciate your patience"));
  assert.ok(terms.includes("due to unforeseen circumstances"));
  assert.notEqual(result.tier, "green");
});

test("extraBannedWords flags a custom term as a hard ban", () => {
  const clean = "We shipped the release notes on time and closed out the sprint.";
  const withoutCustom = auditText(clean);
  assert.equal(withoutCustom.findings.length, 0);

  const withCustom = auditText(clean, { extraBannedWords: ["sprint"] });
  const finding = withCustom.findings.find((f) => f.term === "sprint");
  assert.ok(finding, "expected a finding for the custom banned word 'sprint'");
  assert.equal(finding!.category, "custom");
  assert.equal(finding!.confidence, "red");
  assert.equal(finding!.scored, true);
});

test("the 'docs' register suppresses markdown-structure detectors that are false positives on a real README (regression: register was accepted and ignored)", () => {
  const text = [
    "# Getting Started",
    "",
    "Install the package, then run the setup script.",
    "",
    "- **Config:** copy .env.example to .env before starting.",
  ].join("\n");

  const withoutRegister = auditText(text);
  assert.ok(
    withoutRegister.findings.some((f) => f.subcategory === "markdown-heading-leak" || f.term.includes("Markdown heading")),
    "expected the heading to be flagged without a register"
  );

  const withDocsRegister = auditText(text, { register: "docs" });
  assert.ok(
    !withDocsRegister.findings.some((f) => f.term.includes("Markdown heading")),
    "the docs register should suppress the markdown-heading-leak detector"
  );
  assert.ok(
    !withDocsRegister.findings.some((f) => f.term.includes("Bolded-term bullet")),
    "the docs register should suppress the bulleted-bold-term detector"
  );
});

test("fenced code blocks are blanked out before auditing, so code content never scores as prose", () => {
  const text = [
    "We should leverage the retry queue here.",
    "",
    "```js",
    "// leverage this cache, it is robust and seamless",
    "function harness() { return leverage(robust, seamless); }",
    "```",
  ].join("\n");
  const result = auditText(text);
  const leverage = result.findings.find((f) => f.term === "leverage");
  assert.ok(leverage, "expected the prose 'leverage' outside the fence to still be flagged");
  assert.equal(leverage!.count, 1, "the five occurrences inside the fenced block should not be counted");
});

test("inline code spans are blanked out before auditing", () => {
  const text = "Run `leverage()` from the CLI; don't leverage untested config in production.";
  const result = auditText(text);
  const leverage = result.findings.find((f) => f.term === "leverage");
  assert.ok(leverage);
  assert.equal(leverage!.count, 1, "the inline-code occurrence should not be counted");
});

test("blanking code preserves character offsets so matches still locate correctly in the original text", () => {
  const text = "`leverage()` aside, we still leverage our partnerships daily.";
  const result = auditText(text);
  const finding = result.findings.find((f) => f.term === "leverage");
  assert.ok(finding);
  assert.equal(finding!.matches?.length, 1);
  const { start, end } = finding!.matches![0];
  assert.equal(text.slice(start, end).toLowerCase(), "leverage");
});

test("register suppression only applies to the requested register, not others", () => {
  const text = "# Getting Started\n\nInstall the package, then run the setup script.";
  const emailRegister = auditText(text, { register: "email" });
  assert.ok(
    emailRegister.findings.some((f) => f.term.includes("Markdown heading")),
    "markdown-heading-leak should still fire for a register that isn't docs"
  );
});

test("allowedWords suppresses a built-in hard-ban match", () => {
  const text = "We need to leverage our existing partnerships to grow.";
  const withoutAllow = auditText(text);
  assert.ok(withoutAllow.findings.some((f) => f.term === "leverage"));

  const withAllow = auditText(text, { allowedWords: ["Leverage"] });
  assert.ok(!withAllow.findings.some((f) => f.term === "leverage"));
});

test("extraBannedWords does not double-report a term already banned by the built-in corpus", () => {
  const result = auditText("We need to leverage our partnerships.", { extraBannedWords: ["leverage"] });
  const matches = result.findings.filter((f) => f.term === "leverage");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "verb");
});

test("extraBannedWords upgrades a softer built-in (orange) term to an always-scored hard ban instead of being dropped by it (regression: a user's explicit ban was silently downgraded to the corpus's cluster-only treatment)", () => {
  const text = "Let's circle back on this next week.";
  const withoutCustom = auditText(text);
  const builtIn = withoutCustom.findings.find((f) => f.term === "circle back");
  assert.ok(builtIn);
  assert.equal(builtIn!.confidence, "orange");
  assert.equal(builtIn!.scored, false, "a single occurrence of the built-in soft-flag term isn't scored on its own");

  const withCustom = auditText(text, { extraBannedWords: ["circle back"] });
  const matches = withCustom.findings.filter((f) => f.term === "circle back");
  assert.equal(matches.length, 1, "expected exactly one finding, not one from the corpus and one from the custom entry");
  assert.equal(matches[0].confidence, "red");
  assert.equal(matches[0].scored, true, "an explicit user ban should always score, even on a single occurrence");
});

test("allowedWords wins over a conflicting extraBannedWords entry for the same term", () => {
  const text = "Our OKF export ran clean this morning.";
  const result = auditText(text, { extraBannedWords: ["OKF"], allowedWords: ["okf"] });
  assert.ok(!result.findings.some((f) => f.term.toLowerCase() === "okf"));
});

test("a single isolated hard-ban word in a short email-length piece does not read as red (regression: dogfood memo 2026-08-07)", () => {
  const filler = Array.from({ length: 45 }, (_, i) => `clean${i}`).join(" ");
  const shortEmail = `We need to leverage our existing partnerships to grow. ${filler}`;
  const result = auditText(shortEmail);
  assert.notEqual(result.tier, "red");
});

test("a single isolated finding no longer swings from orange/red to red purely because the piece is short (regression: dogfood memo 2026-08-07)", () => {
  const oneOccurrence = "We need to leverage our existing partnerships to grow.";
  const pad = (target: number) => {
    const filler = Array.from({ length: target }, (_, i) => `clean${i}`).join(" ");
    return `${oneOccurrence} ${filler}`;
  };
  const threeHundredWords = auditText(pad(292));
  const thousandWords = auditText(pad(992));
  assert.equal(threeHundredWords.tier, thousandWords.tier);
});

test("a single-word corpus term capitalized mid-sentence is treated as a likely proper noun and excluded (regression: 'Neon' the Postgres provider false-positived against the 'neon' imagery-cliche term)", () => {
  const clicheOnly = auditText("The alley glowed with neon signs and rain-slicked pavement.");
  const cliche = clicheOnly.findings.find((f) => f.term === "neon");
  assert.ok(cliche, "expected the lowercase imagery cliche to still be flagged");
  assert.equal(cliche!.count, 1);

  const properNounOnly = auditText("Dictionaries are scoped to their own account via Postgres (Neon, provisioned automatically).");
  assert.ok(!properNounOnly.findings.some((f) => f.term === "neon"), "expected the capitalized product name to be excluded");

  const mixed = auditText("Bathed in neon glow, the server talks to Neon, the Postgres provider, over TLS.");
  const mixedFinding = mixed.findings.find((f) => f.term === "neon");
  assert.ok(mixedFinding, "expected the lowercase occurrence to still count even alongside the excluded one");
  assert.equal(mixedFinding!.count, 1);
});

test("corpus terms match their inflected forms, not just the exact listed word", () => {
  const result = auditText("These frameworks are robustly tested against every edge case we found.");
  assert.ok(result.findings.some((f) => f.term === "robust" && f.count === 1), "expected 'robustly' to match the 'robust' entry");
  assert.ok(result.findings.some((f) => f.term === "framework" && f.count === 1), "expected 'frameworks' to match the 'framework' entry");
});

test("an inflected form already listed as its own corpus entry is not double-counted under the base term", () => {
  const result = auditText("We dived right in, and the team dives into new data every sprint, still diving in deep.");
  const dive = result.findings.find((f) => f.term === "dive");
  const diving = result.findings.find((f) => f.term === "diving");
  assert.ok(dive, "expected 'dived'/'dives' to match the 'dive' entry");
  assert.equal(dive!.count, 2);
  assert.ok(diving, "expected 'diving' to keep matching its own explicit entry");
  assert.equal(diving!.count, 1);
});

test("strong specificity/groundedness caps the tier: soft tells alone can't push dense, named, concrete writing past yellow (regression: strengths were pure information, never fed back into the score)", () => {
  const groundedButFlagged = [
    "Q3 revenue grew 4.2% to $1.8 billion, driven by a 340-basis-point margin improvement at the Northeast hub.",
    "Priya Malhotra's team cut fulfillment time from 6.3 days to 2.1 days between January and March 2026 by rerouting 60% of orders through the Newark facility, and the model therefore caught the March slowdown two weeks before Q2 closed.",
    "Therefore, the elasticity framework held up: fixed costs stayed at $412,000 monthly across all twelve regions, and the 8% churn drop in April tracked with the loyalty-program rollout on the 14th, itself built on the same framework Priya shipped last June.",
  ].join("\n\n");
  const result = auditText(groundedButFlagged);
  assert.ok(result.findings.some((f) => f.scored), "expected this piece to still pick up scored findings");
  assert.ok(result.strengths.specificityPer1000Words >= 15);
  assert.ok(result.strengths.concreteAbstractRatio >= 2);
  assert.notEqual(result.tier, "orange");
  assert.notEqual(result.tier, "red");
});

test("the strengths cap never applies when a hard_evidence finding (an unambiguous assistant artifact) is present, no matter how specific the rest of the piece is", () => {
  const specificButLeaked = [
    "Q3 revenue grew 4.2% to $1.8 billion, driven by a 340-basis-point margin improvement at the Northeast hub.",
    "Priya Malhotra's team cut fulfillment time from 6.3 days to 2.1 days between January and March 2026 by rerouting 60% of orders through the Newark facility.",
    "As an AI language model, I don't have access to real-time data, but the April numbers should track close to this.",
  ].join("\n\n");
  const result = auditText(specificButLeaked);
  assert.ok(result.strengths.specificityPer1000Words >= 15);
  assert.ok(result.strengths.concreteAbstractRatio >= 2, "expected both strength signals to clear the cap's own bar");
  assert.ok(
    result.findings.some((f) => f.scored && f.term.includes("cutoff-date hedge")),
    "expected the cutoff-date disclaimer to be a scored hard_evidence finding"
  );
  // Without the hard_evidence exemption, clearing both strength thresholds
  // would cap this at "yellow" (see the test above); with an unambiguous
  // assistant artifact present, the raw, uncapped tier applies instead.
  assert.notEqual(result.tier, "yellow");
  assert.notEqual(result.tier, "green");
});

test("repeated occurrences of a term increase score but with diminishing (capped) weight", () => {
  const once = auditText("We should leverage this. " + "Padding word here to keep density comparable. ".repeat(20));
  const many = auditText("We should leverage leverage leverage leverage leverage leverage leverage this. " + "Padding word here to keep density comparable. ".repeat(20));
  assert.ok(many.score > once.score, "more repetitions should score at least as high");
});
