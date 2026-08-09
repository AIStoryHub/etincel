import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePublicStyleRef } from "./publicStyleSource.js";

test("parsePublicStyleRef accepts a well-formed handle/slug address", () => {
  assert.deepEqual(parsePublicStyleRef("jpleblanc/blunt-memo"), { handle: "jpleblanc", slug: "blunt-memo" });
  assert.deepEqual(parsePublicStyleRef("etincel/founder-memo"), { handle: "etincel", slug: "founder-memo" });
  // Tolerates surrounding whitespace, the way a pasted address might carry it.
  assert.deepEqual(parsePublicStyleRef("  jpleblanc/blunt-memo  "), { handle: "jpleblanc", slug: "blunt-memo" });
});

test("parsePublicStyleRef rejects anything that isn't a handle/slug address", () => {
  // A bare preset id: no "/" at all.
  assert.equal(parsePublicStyleRef("founder-memo"), undefined);
  // A trained voice's UUID.
  assert.equal(parsePublicStyleRef("f0a893bf-41cd-4fb8-afcb-ff5a3c607264"), undefined);
  // More than one segment.
  assert.equal(parsePublicStyleRef("a/b/c"), undefined);
  // Empty handle or slug.
  assert.equal(parsePublicStyleRef("/blunt-memo"), undefined);
  assert.equal(parsePublicStyleRef("jpleblanc/"), undefined);
  // Handle can't start with a digit or hyphen (matches isValidHandle in
  // web/lib/publishStore.neon.ts, so nothing ever parses here that could
  // never have been claimed as a real handle).
  assert.equal(parsePublicStyleRef("1abc/slug"), undefined);
  assert.equal(parsePublicStyleRef("-abc/slug"), undefined);
});
