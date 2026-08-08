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
const { fsVoiceStore } = await import("../engine/voiceStore.fs.js");
const { createDictionaryTools } = await import("./dictionary.js");

const {
  addBannedWordTool,
  removeBannedWordTool,
  addCustomWordTool,
  removeCustomWordTool,
  listDictionaryTool,
  copyDictionaryTool,
} = createDictionaryTools(fsDictionaryStore, fsVoiceStore);

test("addBannedWordTool with no styleId writes to the global scope", async () => {
  const dict = await addBannedWordTool("bandwidth");
  assert.equal(dict.scope, "global");
  assert.deepEqual(dict.bannedWords, ["bandwidth"]);
});

test("addBannedWordTool with a styleId writes to that scope only", async () => {
  const dict = await addBannedWordTool("circle back", "sales-voice");
  assert.equal(dict.scope, "sales-voice");
  const global = await listDictionaryTool();
  assert.ok(!global.bannedWords.includes("circle back"));
});

test("addBannedWordTool rejects an empty word", async () => {
  await assert.rejects(() => addBannedWordTool("   "), /cannot be empty/i);
});

test("removeBannedWordTool and addCustomWordTool/removeCustomWordTool round-trip", async () => {
  await addBannedWordTool("throwaway", "roundtrip-scope");
  await removeBannedWordTool("throwaway", "roundtrip-scope");
  let dict = await listDictionaryTool("roundtrip-scope");
  assert.deepEqual(dict.bannedWords, []);

  await addCustomWordTool("OKF", "roundtrip-scope");
  dict = await listDictionaryTool("roundtrip-scope");
  assert.deepEqual(dict.allowedWords, ["OKF"]);

  await removeCustomWordTool("okf", "roundtrip-scope");
  dict = await listDictionaryTool("roundtrip-scope");
  assert.deepEqual(dict.allowedWords, []);
});

test("listDictionaryTool for a style scope reports the effective merge with global", async () => {
  await addBannedWordTool("orgwide-term", undefined);
  await addBannedWordTool("style-only-term", "merge-scope");
  const dict = await listDictionaryTool("merge-scope");
  assert.deepEqual(dict.bannedWords, ["style-only-term"]);
  assert.ok(dict.effective);
  assert.ok(dict.effective!.bannedWords.includes("orgwide-term"));
  assert.ok(dict.effective!.bannedWords.includes("style-only-term"));
});

test("copyDictionaryTool copies a scope's lists onto another named scope", async () => {
  await addBannedWordTool("copy-me", "copy-source");
  await addCustomWordTool("also-copy-me", "copy-source");
  const result = await copyDictionaryTool("copy-dest", "copy-source");
  assert.deepEqual(result, { from: "copy-source", copiedTo: ["copy-dest"] });

  const dest = await listDictionaryTool("copy-dest");
  assert.deepEqual(dest.bannedWords, ["copy-me"]);
  assert.deepEqual(dest.allowedWords, ["also-copy-me"]);
});

test("copyDictionaryTool rejects copying a scope onto itself", async () => {
  await assert.rejects(() => copyDictionaryTool("same-scope", "same-scope"), /same scope/i);
});

test('copyDictionaryTool("all") fans a dictionary out to every known style, excluding the source', async () => {
  const fanoutVoice = await fsVoiceStore.trainVoice("Fanout Voice", ["A real writing sample used to train this voice."]);
  await addBannedWordTool("fanout-term", "global");
  const result = await copyDictionaryTool("all", "global");
  assert.equal(result.from, "global");
  assert.ok(!result.copiedTo.includes("global"), "source scope should be excluded from its own fan-out");
  assert.ok(result.copiedTo.includes(fanoutVoice.id));
  assert.ok(result.copiedTo.some((id) => id === "direct-warm" || id === "pr-review"), "expected preset ids among copy targets");

  const forkedTarget = await listDictionaryTool(fanoutVoice.id);
  assert.ok(forkedTarget.bannedWords.includes("fanout-term"));
});
