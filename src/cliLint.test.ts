import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLintArgs, runLint, formatText, formatJson, tierRank } from "./cliLint.js";

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
    !readme!.topFindings.some((f) => f.term.includes("Markdown heading")),
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
    readme!.topFindings.some((f) => f.term.includes("Markdown heading")),
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

test("runLint has no configPath and no config-driven findings when no .etincelrc is present", () => {
  const report = runLint({ patterns: ["draft.md"], format: "text" }, configRoot);
  assert.equal(report.configPath, undefined);
  const terms = report.files[0].topFindings.map((f) => f.term);
  assert.ok(terms.includes("leverage"), "expected the built-in corpus hit to still fire");
  assert.ok(terms.includes("synergy"), "expected the built-in corpus hit to still fire");
  assert.ok(!terms.includes("rollout"), "rollout isn't a built-in term, shouldn't be flagged without a config");
});

test("runLint applies bannedWords and allowedWords from a repo-local .etincelrc", () => {
  const configPath = join(configRoot, ".etincelrc");
  writeFileSync(configPath, JSON.stringify({ bannedWords: ["rollout"], allowedWords: ["leverage"] }));

  const report = runLint({ patterns: ["draft.md"], format: "text" }, configRoot);
  const terms = report.files[0].topFindings.map((f) => f.term);
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
