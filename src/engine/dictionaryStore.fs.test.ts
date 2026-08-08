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

const { fsDictionaryStore } = await import("./dictionaryStore.fs.js");
const { getDictionary, addBannedWord, removeBannedWord, addAllowedWord, removeAllowedWord, setDictionary } =
  fsDictionaryStore;

test("getDictionary returns an empty dictionary for an unknown scope", async () => {
  const dict = await getDictionary("global");
  assert.deepEqual(dict.bannedWords, []);
  assert.deepEqual(dict.allowedWords, []);
});

test("addBannedWord persists and round-trips", async () => {
  await addBannedWord("global", "synergy");
  const dict = await getDictionary("global");
  assert.deepEqual(dict.bannedWords, ["synergy"]);
});

test("addBannedWord de-dupes case-insensitively, keeping first-seen casing", async () => {
  await addBannedWord("dedupe-scope", "Synergy");
  await addBannedWord("dedupe-scope", "synergy");
  await addBannedWord("dedupe-scope", "SYNERGY");
  const dict = await getDictionary("dedupe-scope");
  assert.deepEqual(dict.bannedWords, ["Synergy"]);
});

test("removeBannedWord is case-insensitive and leaves other words alone", async () => {
  await addBannedWord("remove-scope", "foo");
  await addBannedWord("remove-scope", "bar");
  await removeBannedWord("remove-scope", "FOO");
  const dict = await getDictionary("remove-scope");
  assert.deepEqual(dict.bannedWords, ["bar"]);
});

test("addAllowedWord and removeAllowedWord operate independently of bannedWords", async () => {
  await addBannedWord("allow-scope", "banned-term");
  await addAllowedWord("allow-scope", "OKF");
  let dict = await getDictionary("allow-scope");
  assert.deepEqual(dict.bannedWords, ["banned-term"]);
  assert.deepEqual(dict.allowedWords, ["OKF"]);

  await removeAllowedWord("allow-scope", "okf");
  dict = await getDictionary("allow-scope");
  assert.deepEqual(dict.allowedWords, []);
  assert.deepEqual(dict.bannedWords, ["banned-term"]);
});

test("scopes are isolated from each other", async () => {
  await addBannedWord("scope-a", "only-in-a");
  await addBannedWord("scope-b", "only-in-b");
  assert.deepEqual((await getDictionary("scope-a")).bannedWords, ["only-in-a"]);
  assert.deepEqual((await getDictionary("scope-b")).bannedWords, ["only-in-b"]);
});

test("setDictionary overwrites a scope's lists outright and de-dupes input", async () => {
  await addBannedWord("overwrite-scope", "stale-word");
  const result = await setDictionary("overwrite-scope", {
    bannedWords: ["fresh", "fresh", "Fresh"],
    allowedWords: ["kept"],
  });
  assert.deepEqual(result.bannedWords, ["fresh"]);
  assert.deepEqual(result.allowedWords, ["kept"]);
  const dict = await getDictionary("overwrite-scope");
  assert.deepEqual(dict.bannedWords, ["fresh"]);
});
