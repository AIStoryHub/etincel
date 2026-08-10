import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findRepoConfig } from "./repoConfig.js";

const root = mkdtempSync(join(tmpdir(), "etincel-repoconfig-test-"));

after(() => {
  rmSync(root, { recursive: true, force: true });
});

test("findRepoConfig returns undefined when no config file exists anywhere up to the repo root", () => {
  const dir = join(root, "no-config");
  mkdirSync(join(dir, ".git"), { recursive: true });
  assert.equal(findRepoConfig(dir), undefined);
});

test("findRepoConfig finds .etincelrc in the starting directory", () => {
  const dir = join(root, "dot-rc");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ bannedWords: ["synergy"], allowedWords: ["OKF"] }));
  const config = findRepoConfig(dir);
  assert.ok(config);
  assert.deepEqual(config!.bannedWords, ["synergy"]);
  assert.deepEqual(config!.allowedWords, ["OKF"]);
  assert.equal(config!.path, join(dir, ".etincelrc"));
});

test("findRepoConfig walks up from a subdirectory to find the config at the repo root", () => {
  const dir = join(root, "walk-up");
  const nested = join(dir, "docs", "nested");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(dir, "etincel.config.json"), JSON.stringify({ bannedWords: ["rollout"] }));
  const config = findRepoConfig(nested);
  assert.ok(config);
  assert.deepEqual(config!.bannedWords, ["rollout"]);
});

test("findRepoConfig does not walk past the repo root (a directory containing .git)", () => {
  const outer = join(root, "boundary-test");
  const repo = join(outer, "repo");
  const nested = join(repo, "src");
  mkdirSync(nested, { recursive: true });
  mkdirSync(join(repo, ".git"));
  // Config lives OUTSIDE the repo (in outer). Should not be found from
  // inside the repo, since the walk stops once it's checked the repo root.
  writeFileSync(join(outer, ".etincelrc"), JSON.stringify({ bannedWords: ["should-not-be-found"] }));
  assert.equal(findRepoConfig(nested), undefined);
});

test("findRepoConfig checks filenames in order: .etincelrc, .etincelrc.json, etincel.config.json", () => {
  const dir = join(root, "precedence");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ bannedWords: ["first"] }));
  writeFileSync(join(dir, ".etincelrc.json"), JSON.stringify({ bannedWords: ["second"] }));
  const config = findRepoConfig(dir);
  assert.deepEqual(config!.bannedWords, ["first"]);
});

test("findRepoConfig parses register and threshold when present", () => {
  const dir = join(root, "register-threshold");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ register: "docs", threshold: "yellow" }));
  const config = findRepoConfig(dir);
  assert.equal(config!.register, "docs");
  assert.equal(config!.threshold, "yellow");
});

test("findRepoConfig throws on malformed JSON instead of silently ignoring it", () => {
  const dir = join(root, "bad-json");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), "{ not valid json");
  assert.throws(() => findRepoConfig(dir), /invalid json/i);
});

test("findRepoConfig throws on a non-object JSON value", () => {
  const dir = join(root, "bad-shape");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify(["not", "an", "object"]));
  assert.throws(() => findRepoConfig(dir), /expected a JSON object/i);
});

test("findRepoConfig throws on a non-string-array bannedWords", () => {
  const dir = join(root, "bad-banned");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ bannedWords: [1, 2, 3] }));
  assert.throws(() => findRepoConfig(dir), /expected an array of strings/i);
});

test("findRepoConfig throws on an invalid register value", () => {
  const dir = join(root, "bad-register");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ register: "haiku" }));
  assert.throws(() => findRepoConfig(dir), /invalid "register"/i);
});

test("findRepoConfig defaults bannedWords/allowedWords to empty arrays when omitted", () => {
  const dir = join(root, "empty-config");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({}));
  const config = findRepoConfig(dir);
  assert.deepEqual(config!.bannedWords, []);
  assert.deepEqual(config!.allowedWords, []);
});

test("findRepoConfig parses team-wide instructions when present", () => {
  const dir = join(root, "instructions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ instructions: "Always include a CTA." }));
  const config = findRepoConfig(dir);
  assert.equal(config!.instructions, "Always include a CTA.");
});

test("findRepoConfig throws on a non-string instructions value", () => {
  const dir = join(root, "bad-instructions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ instructions: 42 }));
  assert.throws(() => findRepoConfig(dir), /invalid "instructions"/i);
});

const VALID_DIALS = {
  formality: 6,
  warmth: 4,
  directness: 7,
  sentenceLength: 40,
  sentenceRhythmVariance: 50,
  paragraphVariance: 30,
  contractionUse: 20,
  emDashUse: 0,
  fragmentTolerance: 10,
  questionUse: 5,
  entropy: 60,
};

test("findRepoConfig parses a team style definition when present", () => {
  const dir = join(root, "team-style");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ style: { name: "House voice", dials: VALID_DIALS } }));
  const config = findRepoConfig(dir);
  assert.ok(config!.style);
  assert.equal(config!.style!.name, "House voice");
  assert.deepEqual(config!.style!.dials, VALID_DIALS);
});

test("findRepoConfig throws when style.name is missing", () => {
  const dir = join(root, "bad-style-name");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ style: { dials: VALID_DIALS } }));
  assert.throws(() => findRepoConfig(dir), /invalid "style\.name"/i);
});

test("findRepoConfig throws when a dial is missing or out of range", () => {
  const dir = join(root, "bad-style-dial");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, ".etincelrc"),
    JSON.stringify({ style: { name: "House voice", dials: { ...VALID_DIALS, formality: 15 } } })
  );
  assert.throws(() => findRepoConfig(dir), /invalid "style\.dials\.formality"/i);
});

test("findRepoConfig throws when style.dials is missing a key entirely", () => {
  const dir = join(root, "missing-style-dial");
  mkdirSync(dir, { recursive: true });
  const { entropy, ...incomplete } = VALID_DIALS;
  writeFileSync(join(dir, ".etincelrc"), JSON.stringify({ style: { name: "House voice", dials: incomplete } }));
  assert.throws(() => findRepoConfig(dir), /invalid "style\.dials\.entropy"/i);
});
