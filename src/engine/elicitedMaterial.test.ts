import { test } from "node:test";
import assert from "node:assert/strict";
import { checkElicitedMaterial } from "./elicitedMaterial.js";

test("checkElicitedMaterial returns undefined when no facts are supplied", () => {
  assert.equal(checkElicitedMaterial([], "Some draft text about anything at all."), undefined);
});

test("checkElicitedMaterial returns undefined when facts are all blank/whitespace", () => {
  assert.equal(checkElicitedMaterial(["   ", ""], "Some draft text."), undefined);
});

test("checkElicitedMaterial marks a fact used when a majority of its content words appear in the draft", () => {
  const facts = ["He has been on skates since he was three."];
  const draft = "My son has been on skates since he was three years old, and it changed everything.";
  const usage = checkElicitedMaterial(facts, draft);
  assert.ok(usage);
  assert.deepEqual(usage.usedFacts, facts);
  assert.deepEqual(usage.unusedFacts, []);
});

test("checkElicitedMaterial marks a fact unused when the draft never touches its distinctive content", () => {
  const facts = ["The rink was cold and mostly empty on weekday mornings."];
  const draft = "I am a highly qualified candidate with a strong track record of delivering results.";
  const usage = checkElicitedMaterial(facts, draft);
  assert.ok(usage);
  assert.deepEqual(usage.usedFacts, []);
  assert.deepEqual(usage.unusedFacts, facts);
});

test("checkElicitedMaterial's quota requires 2+ used facts", () => {
  const facts = ["The coach's name was Dave.", "The rink was cold most mornings."];
  const draft = "The coach's name was Dave, and everyone respected him a great deal for his patience.";
  const usage = checkElicitedMaterial(facts, draft);
  assert.ok(usage);
  assert.equal(usage.usedFacts.length, 1);
  assert.equal(usage.meetsQuota, false);
});

test("checkElicitedMaterial's quota requires at least one used fact in a non-evidentiary sentence, per D4's reused test", () => {
  const facts = ["The coach's name was Dave.", "The rink was cold most mornings."];
  // Both facts appear, but only inside sentences carrying a numeral/proper
  // noun/achievement verb (evidentiary), so the quota isn't met even
  // though two facts are technically used.
  const draft =
    "Coach Dave's name led a $3.4M campaign at the cold rink that grew donations by 53% every single morning of the year.";
  const usage = checkElicitedMaterial(facts, draft);
  assert.ok(usage);
  assert.equal(usage.usedFacts.length, 2);
  assert.equal(usage.usedInNonEvidentiarySentence, false);
  assert.equal(usage.meetsQuota, false);
});

test("checkElicitedMaterial's quota is met with 2+ used facts and at least one in a non-evidentiary sentence", () => {
  const facts = ["The coach's name was Dave.", "The rink was cold most mornings."];
  const draft =
    "The coach's name was Dave, and he believed in my son before there was much evidence to believe in yet. The rink was cold most mornings, and mostly empty too.";
  const usage = checkElicitedMaterial(facts, draft);
  assert.ok(usage);
  assert.equal(usage.usedFacts.length, 2);
  assert.equal(usage.usedInNonEvidentiarySentence, true);
  assert.equal(usage.meetsQuota, true);
});
