import { test } from "node:test";
import assert from "node:assert/strict";
import { secondReadTool } from "./secondRead.js";
import { localSecondReadSource, type SecondReadSource } from "../engine/secondReadSource.js";

test("secondReadTool rejects empty text", async () => {
  await assert.rejects(() => secondReadTool(localSecondReadSource, "   "), /nothing to read/i);
});

test("localSecondReadSource always explains it needs the hosted server, never silently returns nothing", async () => {
  await assert.rejects(
    () => secondReadTool(localSecondReadSource, "A draft with real words in it."),
    /requires the hosted server/i
  );
});

test("secondReadTool passes text through to whatever source it's given", async () => {
  const observations = [{ quote: "a phrase", observation: "reads a little hedged here" }];
  const stub: SecondReadSource = {
    async secondRead(text) {
      assert.equal(text, "A draft with real words in it.");
      return { observations, model: "test-model" };
    },
  };
  const result = await secondReadTool(stub, "A draft with real words in it.");
  assert.deepEqual(result, { observations, model: "test-model" });
});
