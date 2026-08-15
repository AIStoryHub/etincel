import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLintArgs, runLint, formatText, formatJson, tierRank } from "./cliLint.js";
import { offsetToLineCol, buildLineStarts } from "./engine/offsets.js";

test("parseLintArgs collects bare arguments as patterns, leaving threshold unset so runLint can fall back to a repo config or 'orange'", () => {
  const parsed = parseLintArgs(["docs/**/*.md"]);
  assert.equal(parsed.kind, "run");
  if (parsed.kind !== "run") return;
  assert.deepEqual(parsed.options.patterns, ["docs/**/*.md"]);
  assert.equal(parsed.options.threshold, undefined);
  assert.equal(parsed.options.register, undefined);
  assert.equal(parsed.options.format, "text");
});

test("parseLintArgs parses --threshold, --register, and --json", () => {
  const parsed = parseLintArgs(["README.md", "--threshold", "yellow", "--register", "email", "--json"]);
  assert.equal(parsed.kind, "run");
  if (parsed.kind !== "run") return;
  assert.equal(parsed.options.threshold, "yellow");
  assert.equal(parsed.options.register, "email");
  assert.equal(parsed.options.format, "json");
});

test("parseLintArgs rejects an invalid --threshold", () => {
  const parsed = parseLintArgs(["README.md", "--threshold", "purple"]);
  assert.equal(parsed.kind, "error");
});

test("parseLintArgs rejects an invalid --register", () => {
  const parsed = parseLintArgs(["README.md", "--register", "haiku"]);
  assert.equal(parsed.kind, "error");
});

test("parseLintArgs rejects an unknown flag", () => {
  const parsed = parseLintArgs(["README.md", "--wat"]);
  assert.equal(parsed.kind, "error");
});

test("parseLintArgs errors when no pattern is given", () => {
  const parsed = parseLintArgs(["--threshold", "red"]);
  assert.equal(parsed.kind, "error");
});

test("parseLintArgs returns help for --help/-h", () => {
  assert.equal(parseLintArgs(["--help"]).kind, "help");
  assert.equal(parseLintArgs(["-h"]).kind, "help");
});

test("tierRank orders tiers green < yellow < orange < red", () => {
  assert.ok(tierRank("green") < tierRank("yellow"));
  assert.ok(tierRank("yellow") < tierRank("orange"));
  assert.ok(tierRank("orange") < tierRank("red"));
});

const root = mkdtempSync(join(tmpdir(), "etincel-lint-test-"));
// A .git marker gives findRepoConfig() a hermetic boundary. Otherwise a
// walk-up test would depend on nothing above the OS tmp dir ever happening
// to contain a .etincelrc, which isn't guaranteed on every machine.
mkdirSync(join(root, ".git"));
mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "clean.md"), "We shipped the fix on Tuesday. It held.");
writeFileSync(
  join(root, "slop.md"),
  "In today's rapidly evolving landscape of technology, it is worth noting that leveraging cutting-edge solutions can unlock a myriad of opportunities."
);
writeFileSync(join(root, "docs", "readme-with-markdown.md"), "# Getting Started\n\nInstall the package, then run the setup script.");

const configRoot = mkdtempSync(join(tmpdir(), "etincel-lint-config-test-"));
mkdirSync(join(configRoot, ".git"));
writeFileSync(join(configRoot, "draft.md"), "We should leverage synergy to drive our rollout forward.");

after(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(configRoot, { recursive: true, force: true });
});

test("runLint audits every matched file and reports which are at or above threshold", () => {
  const report = runLint({ patterns: ["*.md"], threshold: "orange", format: "text" }, root);
  assert.equal(report.files.length, 2);
  const slop = report.files.find((f) => f.file === "slop.md");
  const clean = report.files.find((f) => f.file === "clean.md");
  assert.ok(slop);
  assert.ok(clean);
  assert.equal(slop!.tier, "red");
  assert.equal(clean!.tier, "green");
  assert.ok(report.failing.some((f) => f.file === "slop.md"));
  assert.ok(!report.failing.some((f) => f.file === "clean.md"));
});

test("runLint defaults .md files to the 'docs' register, suppressing markdown-structure false positives", () => {
  const withoutOverride = runLint({ patterns: ["docs/*.md"], threshold: "red", format: "text" }, root);
  const readme = withoutOverride.files.find((f) => f.file === "docs/readme-with-markdown.md");
  assert.ok(readme);
  assert.ok(
    !readme!.findings.some((f) => f.term.includes("Markdown heading")),
    "expected the default docs register to suppress the markdown-heading-leak finding"
  );
});

test("runLint's --register override wins over the .md default", () => {
  const forced = runLint(
    { patterns: ["docs/*.md"], threshold: "red", register: "email", format: "text" },
    root
  );
  const readme = forced.files.find((f) => f.file === "docs/readme-with-markdown.md");
  assert.ok(readme);
  assert.ok(
    readme!.findings.some((f) => f.term.includes("Markdown heading")),
    "expected an explicit --register override to bypass the docs default"
  );
});

test("runLint returns no files for a pattern that matches nothing, rather than throwing", () => {
  const report = runLint({ patterns: ["*.rst"], threshold: "orange", format: "text" }, root);
  assert.deepEqual(report.files, []);
  assert.deepEqual(report.failing, []);
});

test("formatText marks failing files distinctly and summarizes the run", () => {
  const report = runLint({ patterns: ["*.md"], threshold: "orange", format: "text" }, root);
  const text = formatText(report);
  assert.match(text, /✗ slop\.md/);
  assert.match(text, /✓ clean\.md/);
  assert.match(text, /2 files audited, 1 at or above orange\./);
});

test("formatJson is valid JSON carrying the threshold, failing count, and per-file results", () => {
  const report = runLint({ patterns: ["*.md"], threshold: "orange", format: "json" }, root);
  const parsed = JSON.parse(formatJson(report));
  assert.equal(parsed.threshold, "orange");
  assert.equal(parsed.failingCount, 1);
  assert.equal(parsed.files.length, 2);
});

test("formatJson round-trips findings, summary, strengths, and categoryBreakdown for each file", () => {
  const report = runLint({ patterns: ["slop.md"], threshold: "orange", format: "json" }, root);
  const parsed = JSON.parse(formatJson(report));
  const file = parsed.files[0];
  assert.ok(Array.isArray(file.findings) && file.findings.length > 0);
  assert.ok(file.findings.every((f: any) => typeof f.category === "string" && typeof f.severity === "string"));
  assert.equal(typeof file.summary, "string");
  assert.ok(file.summary.length > 0);
  assert.ok(Array.isArray(file.categoryBreakdown) && file.categoryBreakdown.length > 0);
  assert.equal(typeof file.strengths.specificityPer1000Words, "number");
  assert.equal(typeof file.strengths.concreteAbstractRatio, "number");
  assert.equal(typeof file.strengths.sentenceBurstiness, "number");
});

test("formatText prints a green/zero-finding file cleanly: summary present, no empty group headings", () => {
  const report = runLint({ patterns: ["clean.md"], threshold: "orange", format: "text" }, root);
  const text = formatText(report);
  assert.match(text, /✓ clean\.md/);
  // The summary line for a clean file (see TIER_SUMMARY in engine/score.ts).
  assert.match(text, /No tells from this pass/);
  assert.ok(report.files[0].findings.length === 0);
  assert.ok(!text.includes("Vocabulary and phrasing"), "expected no group heading when there are no findings");
  assert.ok(!text.includes("Whole-piece rhythm"), "expected no group heading when there are no findings");
});

const rhythmParagraph = "Short sentence here now. Short sentence here too.";

test("formatText shows every Whole-piece rhythm finding with its note, and sorts the structural group above the lexical one", () => {
  const mixedRoot = mkdtempSync(join(tmpdir(), "etincel-lint-mixed-test-"));
  mkdirSync(join(mixedRoot, ".git"));
  const mixedText = [
    "We should leverage synergy to drive our rollout forward.",
    rhythmParagraph,
    rhythmParagraph,
    rhythmParagraph,
    rhythmParagraph,
  ].join("\n\n");
  writeFileSync(join(mixedRoot, "mixed.md"), mixedText);

  const report = runLint({ patterns: ["mixed.md"], threshold: "orange", register: "general", format: "text" }, mixedRoot);
  const file = report.files[0];
  const rhythmFindings = file.findings.filter((f) => f.category === "Whole-piece rhythm");
  assert.ok(rhythmFindings.length >= 2, "expected both rhythm checks to fire on this text");
  assert.ok(rhythmFindings.every((f) => typeof f.note === "string" && f.note!.length > 0));

  const text = formatText(report);
  const normalized = text.replace(/\s+/g, " ");
  for (const f of rhythmFindings) {
    assert.ok(
      normalized.includes(f.note!.replace(/\s+/g, " ")),
      `expected the note for ${f.subcategory} to appear in the rendered output`
    );
  }
  const rhythmHeadingIndex = text.indexOf("Whole-piece rhythm");
  const vocabHeadingIndex = text.indexOf("Vocabulary and phrasing");
  assert.ok(rhythmHeadingIndex >= 0 && vocabHeadingIndex >= 0, "expected both group headings to appear");
  assert.ok(rhythmHeadingIndex < vocabHeadingIndex, "expected the structural group to sort above the lexical one");

  rmSync(mixedRoot, { recursive: true, force: true });
});

test("formatText sorts the lexical group by descending count, then alphabetically", () => {
  const sortRoot = mkdtempSync(join(tmpdir(), "etincel-lint-sort-test-"));
  mkdirSync(join(sortRoot, ".git"));
  writeFileSync(
    join(sortRoot, "sort.md"),
    // "leverage" occurs 3x (higher count should sort first, ranking above
    // severity: "streamline" is a single-occurrence hard-ban term but
    // still sorts below "leverage"). "comprehensive" and "streamline" both
    // occur once, so they fall back to alphabetical order.
    "We should leverage this. Let's leverage that. Time to leverage everything. This is a streamline and comprehensive plan."
  );
  const report = runLint({ patterns: ["sort.md"], threshold: "orange", format: "text" }, sortRoot);
  const text = formatText(report);
  const groupSection = text.slice(text.indexOf("Vocabulary and phrasing"));
  const leverageIndex = groupSection.indexOf("leverage");
  const comprehensiveIndex = groupSection.indexOf("comprehensive");
  const streamlineIndex = groupSection.indexOf("streamline");
  assert.ok(leverageIndex >= 0 && comprehensiveIndex >= 0 && streamlineIndex >= 0);
  assert.ok(leverageIndex < comprehensiveIndex, "expected the higher-count finding to sort first regardless of severity");
  assert.ok(comprehensiveIndex < streamlineIndex, "expected equal-count findings to fall back to alphabetical order");

  rmSync(sortRoot, { recursive: true, force: true });
});

test("formatText pads lexical labels and positions so the L:C and hint columns line up within a group", () => {
  const padRoot = mkdtempSync(join(tmpdir(), "etincel-lint-pad-test-"));
  mkdirSync(join(padRoot, ".git"));
  writeFileSync(padRoot + "/pad.md", "We should leverage this comprehensive plan to streamline delivery.");
  const report = runLint({ patterns: ["pad.md"], threshold: "orange", format: "text" }, padRoot);
  const text = formatText(report);
  const groupLines = text
    .slice(text.indexOf("Vocabulary and phrasing"))
    .split("\n")
    .filter((line) => /^\s{4}(critical|high|medium|low)\s/.test(line));
  assert.ok(groupLines.length >= 2, "expected at least two lexical finding lines to compare column alignment");
  const positionColumn = (line: string) => line.search(/L\d+:C\d+/);
  const columns = groupLines.map(positionColumn);
  assert.ok(
    columns.every((c) => c === columns[0]),
    `expected every L:C position to start at the same column, got ${JSON.stringify(columns)}`
  );

  rmSync(padRoot, { recursive: true, force: true });
});

test("formatText merges findings sharing a term and an identical match span into one line, and findingCount reflects the merge", () => {
  const dupRoot = mkdtempSync(join(tmpdir(), "etincel-lint-dup-test-"));
  mkdirSync(join(dupRoot, ".git"));
  // "it is worth noting" fires two corpus entries (didactic-hedge and
  // editorializing-marker) at the exact same span; a reader counting
  // distinct problems should see one line, not two, and findingCount
  // should agree with what's printed.
  writeFileSync(join(dupRoot, "dup.md"), "It is worth noting that this matters.");
  const report = runLint({ patterns: ["dup.md"], threshold: "orange", format: "text" }, dupRoot);
  const file = report.files[0];
  assert.equal(file.findings.filter((f) => f.term === "it is worth noting").length, 1);
  assert.equal(file.findingCount, file.findings.length);
  const merged = file.findings.find((f) => f.term === "it is worth noting")!;
  assert.ok(merged.subcategory.includes("didactic-hedge"));
  assert.ok(merged.subcategory.includes("editorializing-marker"));

  const text = formatText(report);
  const occurrences = text.split("it is worth noting").length - 1;
  assert.equal(occurrences, 1, "expected the duplicate-span finding to render exactly once");
  assert.match(text, /it is worth noting \(didactic-hedge, editorializing-marker\)/);

  rmSync(dupRoot, { recursive: true, force: true });
});

test("formatText suppresses the strengths block below the reliable-read word count, and drops it entirely on empty input", () => {
  const shortRoot = mkdtempSync(join(tmpdir(), "etincel-lint-short-test-"));
  mkdirSync(join(shortRoot, ".git"));
  writeFileSync(join(shortRoot, "tiny.md"), "# Hi");
  writeFileSync(join(shortRoot, "empty.md"), "");

  const tinyReport = runLint({ patterns: ["tiny.md"], threshold: "orange", format: "text" }, shortRoot);
  const tinyText = formatText(tinyReport);
  assert.match(tinyText, /strengths\s+not enough text to measure \(2 words\)/);
  assert.ok(!tinyText.includes("specificity"), "expected no raw specificity/burstiness numbers below the word-count floor");

  const emptyReport = runLint({ patterns: ["empty.md"], threshold: "orange", format: "text" }, shortRoot);
  const emptyText = formatText(emptyReport);
  assert.ok(!emptyText.includes("strengths"), "expected no strengths block at all on empty input");
  assert.match(emptyText, /Empty input\./);

  rmSync(shortRoot, { recursive: true, force: true });
});

test("runLint caps lexical findings at 20 per file and formatText notes the omitted count, while never truncating structural findings", () => {
  const capRoot = mkdtempSync(join(tmpdir(), "etincel-lint-cap-test-"));
  mkdirSync(join(capRoot, ".git"));
  const bannedWords = Array.from({ length: 25 }, (_, i) => `zzzcustomterm${i}`);
  writeFileSync(join(capRoot, ".etincelrc"), JSON.stringify({ bannedWords }));
  const bannedSentence = bannedWords.map((w) => `We saw ${w} today.`).join(" ");
  const text = [bannedSentence, rhythmParagraph, rhythmParagraph, rhythmParagraph, rhythmParagraph].join("\n\n");
  writeFileSync(join(capRoot, "cap.md"), text);

  const report = runLint({ patterns: ["cap.md"], threshold: "orange", register: "general", format: "text" }, capRoot);
  const file = report.files[0];
  const lexicalFindings = file.findings.filter((f) => f.category === "custom");
  assert.equal(lexicalFindings.length, 25, "expected all 25 distinct custom-banned terms to be found by the engine");
  const rhythmFindings = file.findings.filter((f) => f.category === "Whole-piece rhythm");
  assert.ok(rhythmFindings.length >= 1);

  const rendered = formatText(report);
  assert.match(rendered, /…and 5 more \(use --json for the full list\)/);
  for (const f of rhythmFindings) {
    assert.ok(rendered.includes(f.subcategory), "expected every structural finding to render, uncapped");
  }

  rmSync(capRoot, { recursive: true, force: true });
});

test("runLint has no configPath and no config-driven findings when no .etincelrc is present", () => {
  const report = runLint({ patterns: ["draft.md"], format: "text" }, configRoot);
  assert.equal(report.configPath, undefined);
  const terms = report.files[0].findings.map((f) => f.term);
  assert.ok(terms.includes("leverage"), "expected the built-in corpus hit to still fire");
  assert.ok(terms.includes("synergy"), "expected the built-in corpus hit to still fire");
  assert.ok(!terms.includes("rollout"), "rollout isn't a built-in term, shouldn't be flagged without a config");
});

test("runLint applies bannedWords and allowedWords from a repo-local .etincelrc", () => {
  const configPath = join(configRoot, ".etincelrc");
  writeFileSync(configPath, JSON.stringify({ bannedWords: ["rollout"], allowedWords: ["leverage"] }));

  const report = runLint({ patterns: ["draft.md"], format: "text" }, configRoot);
  const terms = report.files[0].findings.map((f) => f.term);
  assert.ok(terms.includes("rollout"), "expected the repo config's bannedWords to add a finding");
  assert.ok(terms.includes("synergy"), "expected the untouched built-in corpus hit to still fire");
  assert.ok(!terms.includes("leverage"), "expected the repo config's allowedWords to suppress the built-in finding");
  assert.equal(report.configPath, configPath);

  rmSync(configPath);
});

test("runLint's repo config sets register/threshold defaults, and an explicit CLI flag overrides them", () => {
  const configPath = join(configRoot, ".etincelrc");
  writeFileSync(configPath, JSON.stringify({ threshold: "red" }));

  const usingConfigDefault = runLint({ patterns: ["draft.md"], format: "text" }, configRoot);
  assert.equal(usingConfigDefault.threshold, "red");

  const explicitOverride = runLint({ patterns: ["draft.md"], threshold: "yellow", format: "text" }, configRoot);
  assert.equal(explicitOverride.threshold, "yellow");

  rmSync(configPath);
});

test("runLint throws when the repo-local config is malformed, same as any other bad input", () => {
  const configPath = join(configRoot, ".etincelrc");
  writeFileSync(configPath, "{ not valid json");
  assert.throws(() => runLint({ patterns: ["draft.md"], format: "text" }, configRoot), /invalid json/i);
  rmSync(configPath);
});
