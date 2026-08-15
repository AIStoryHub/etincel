import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLineStarts, offsetToLineCol } from "./offsets.js";

test("offsetToLineCol resolves offset 0 to line 1, col 1", () => {
  const text = "hello world";
  const lineStarts = buildLineStarts(text);
  assert.deepEqual(offsetToLineCol(lineStarts, 0), { line: 1, col: 1 });
});

test("offsetToLineCol resolves a match on the first line", () => {
  const text = "The quick brown fox\njumps over the lazy dog";
  const lineStarts = buildLineStarts(text);
  const offset = text.indexOf("brown");
  assert.deepEqual(offsetToLineCol(lineStarts, offset), { line: 1, col: offset + 1 });
});

test("offsetToLineCol resolves a match after several newlines", () => {
  const text = "one\ntwo\nthree\nfour target here\nfive";
  const lineStarts = buildLineStarts(text);
  const offset = text.indexOf("target");
  const result = offsetToLineCol(lineStarts, offset);
  assert.equal(result.line, 4);
  assert.equal(result.col, "four ".length + 1);
});

test("offsetToLineCol resolves the last character of the file", () => {
  const text = "abc\ndef\nghi";
  const lineStarts = buildLineStarts(text);
  const lastOffset = text.length - 1;
  assert.deepEqual(offsetToLineCol(lineStarts, lastOffset), { line: 3, col: 3 });
});

test("buildLineStarts always starts with 0 and adds one entry per newline", () => {
  const text = "a\nbb\nccc";
  const lineStarts = buildLineStarts(text);
  assert.deepEqual(lineStarts, [0, 2, 5]);
});
