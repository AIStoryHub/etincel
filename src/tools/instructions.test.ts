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

const { fsInstructionsStore } = await import("../engine/instructionsStore.fs.js");
const { createInstructionsTools } = await import("./instructions.js");

const { setStyleInstructionsTool, clearStyleInstructionsTool, getStyleInstructionsTool } =
  createInstructionsTools(fsInstructionsStore);

test("setStyleInstructionsTool with no styleId writes to the global scope", async () => {
  const result = await setStyleInstructionsTool("Always end with a call to action.");
  assert.equal(result.scope, "global");
  assert.equal(result.instructions, "Always end with a call to action.");
});

test("setStyleInstructionsTool with a styleId writes to that scope only", async () => {
  await setStyleInstructionsTool("Never mention pricing.", "sales-voice");
  const global = await getStyleInstructionsTool();
  assert.ok(!global.instructions.includes("Never mention pricing"));
});

test("setStyleInstructionsTool trims whitespace", async () => {
  const result = await setStyleInstructionsTool("  spaced out  \n", "trim-scope");
  assert.equal(result.instructions, "spaced out");
});

test("getStyleInstructionsTool for a style scope reports the effective merge with global", async () => {
  await setStyleInstructionsTool("Global note.", undefined);
  await setStyleInstructionsTool("Style-only note.", "merge-scope");
  const result = await getStyleInstructionsTool("merge-scope");
  assert.equal(result.instructions, "Style-only note.");
  assert.ok("effective" in result);
  assert.equal(result.effective, "Global note.\n\nStyle-only note.");
});

test("getStyleInstructionsTool merge skips an empty side instead of leaving a blank line", async () => {
  await setStyleInstructionsTool("", undefined);
  await setStyleInstructionsTool("Only mine.", "solo-scope");
  const result = await getStyleInstructionsTool("solo-scope");
  assert.equal(result.effective, "Only mine.");
});

test("clearStyleInstructionsTool empties a scope without touching others", async () => {
  await setStyleInstructionsTool("Temporary.", "clear-scope");
  await setStyleInstructionsTool("Untouched.", "other-scope");
  const cleared = await clearStyleInstructionsTool("clear-scope");
  assert.equal(cleared.instructions, "");
  const other = await getStyleInstructionsTool("other-scope");
  assert.equal(other.instructions, "Untouched.");
});

test("getStyleInstructionsTool for an unset scope returns empty, not an error", async () => {
  const result = await getStyleInstructionsTool("never-touched-scope");
  assert.equal(result.instructions, "");
  assert.equal(result.effective, "");
});
