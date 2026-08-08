import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFreeformText } from "./sanitizeText.js";

test("sanitizeFreeformText strips CSI color/style escapes", () => {
  assert.equal(sanitizeFreeformText("Warm\x1b[31m tone\x1b[0m"), "Warm tone");
});

test("sanitizeFreeformText strips OSC sequences (title-set style)", () => {
  assert.equal(sanitizeFreeformText("before\x1b]0;pwn\x07after"), "beforeafter");
});

test("sanitizeFreeformText strips raw C0/C1 control bytes", () => {
  assert.equal(sanitizeFreeformText("a\x00b\x07c\x9fd"), "abcd");
});

test("sanitizeFreeformText preserves tabs, newlines, and ordinary prose", () => {
  const clean = "Line one.\nLine two,\twith a tab and an em dash — intact.";
  assert.equal(sanitizeFreeformText(clean), clean);
});

test("sanitizeFreeformText preserves non-ASCII prose", () => {
  const clean = "Café, naïve, façade — all fine.";
  assert.equal(sanitizeFreeformText(clean), clean);
});
