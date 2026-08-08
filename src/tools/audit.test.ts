import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpHome = mkdtempSync(join(tmpdir(), "etincel-test-"));
process.env.ETINCEL_HOME = tmpHome;

after(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

const { fsDictionaryStore } = await import("../engine/dictionaryStore.fs.js");
const { auditTextTool } = await import("./audit.js");

test("auditTextTool rejects empty text", async () => {
  await assert.rejects(() => auditTextTool(fsDictionaryStore, "   "), /nothing to audit/i);
});

test("auditTextTool audits against the global dictionary when no styleId is given", async () => {
  await fsDictionaryStore.addBannedWord("global", "rollout");
  const result = await auditTextTool(fsDictionaryStore, "We planned the rollout for Tuesday.");
  assert.ok(result.findings.some((f) => f.term === "rollout"));
  assert.equal(result.styleId, null);
});

test("auditTextTool merges a style-scoped dictionary on top of the global one", async () => {
  await fsDictionaryStore.addBannedWord("global", "synergy");
  await fsDictionaryStore.addBannedWord("my-voice", "circle back");
  const result = await auditTextTool(
    fsDictionaryStore,
    "Let's circle back on synergy next week.",
    undefined,
    "my-voice"
  );
  const terms = result.findings.map((f) => f.term);
  assert.ok(terms.includes("synergy"), "expected the global banned word to still apply");
  assert.ok(terms.includes("circle back"), "expected the style-scoped banned word to apply");
  assert.equal(result.styleId, "my-voice");
});

test("auditTextTool does not leak a style-scoped banned word into a different style", async () => {
  await fsDictionaryStore.addBannedWord("voice-a", "only-in-a");
  const result = await auditTextTool(fsDictionaryStore, "Nothing unusual here.", undefined, "voice-b");
  assert.ok(!result.findings.some((f) => f.term === "only-in-a"));
});

test("auditTextTool passes register through to gate false-positive detectors on a README", async () => {
  const text = "# Getting Started\n\nInstall the package, then run the setup script.";
  const withoutRegister = await auditTextTool(fsDictionaryStore, text);
  assert.ok(withoutRegister.findings.some((f) => f.term.includes("Markdown heading")));

  const withDocsRegister = await auditTextTool(fsDictionaryStore, text, "docs");
  assert.ok(!withDocsRegister.findings.some((f) => f.term.includes("Markdown heading")));
  assert.equal(withDocsRegister.register, "docs");
});

test("auditTextTool surfaces the strengths signal from the underlying audit", async () => {
  const result = await auditTextTool(
    fsDictionaryStore,
    "Priya shipped the fix on March 19, 2026. Q3 renewal came in at 94%, three points ahead of plan."
  );
  assert.ok(result.strengths.specificityPer1000Words > 0);
});

test("auditTextTool merges an extra (repo-config) dictionary alongside the account/style one", async () => {
  await fsDictionaryStore.addBannedWord("global", "synergy");
  const result = await auditTextTool(
    fsDictionaryStore,
    "We should leverage synergy to drive our rollout forward.",
    undefined,
    undefined,
    { bannedWords: ["rollout"], allowedWords: ["leverage"] }
  );
  const terms = result.findings.map((f) => f.term);
  assert.ok(terms.includes("rollout"), "expected the repo-config bannedWords to add a finding");
  assert.ok(terms.includes("synergy"), "expected the account dictionary's banned word to still apply");
  assert.ok(!terms.includes("leverage"), "expected the repo-config allowedWords to suppress the built-in finding");
});

test("auditTextTool suppresses a built-in flag via an allowed word merged from global", async () => {
  await fsDictionaryStore.addAllowedWord("global", "leverage");
  const result = await auditTextTool(fsDictionaryStore, "We need to leverage our partnerships.");
  assert.ok(!result.findings.some((f) => f.term === "leverage"));
});
