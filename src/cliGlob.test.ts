import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globToRegExp, resolveGlob, resolveGlobs } from "./cliGlob.js";

test("globToRegExp: '*' matches within a segment but not across '/'", () => {
  const re = globToRegExp("*.md");
  assert.ok(re.test("readme.md"));
  assert.ok(!re.test("docs/readme.md"));
});

test("globToRegExp: '**' matches across any number of segments, including zero", () => {
  const re = globToRegExp("docs/**/*.md");
  assert.ok(re.test("docs/readme.md"));
  assert.ok(re.test("docs/a/b/c/readme.md"));
  assert.ok(!re.test("src/readme.md"));
});

test("globToRegExp: '?' matches exactly one character", () => {
  const re = globToRegExp("file?.md");
  assert.ok(re.test("file1.md"));
  assert.ok(!re.test("file12.md"));
});

test("globToRegExp: literal dots and other regex metacharacters are escaped", () => {
  const re = globToRegExp("a.b+c.md");
  assert.ok(re.test("a.b+c.md"));
  assert.ok(!re.test("aXb+c.md"));
});

const root = mkdtempSync(join(tmpdir(), "etincel-glob-test-"));
mkdirSync(join(root, "docs", "nested"), { recursive: true });
mkdirSync(join(root, "src"), { recursive: true });
mkdirSync(join(root, "node_modules", "some-pkg"), { recursive: true });
writeFileSync(join(root, "README.md"), "top level");
writeFileSync(join(root, "docs", "one.md"), "doc one");
writeFileSync(join(root, "docs", "nested", "two.md"), "doc two");
writeFileSync(join(root, "src", "index.ts"), "code");
writeFileSync(join(root, "node_modules", "some-pkg", "readme.md"), "should be ignored");

after(() => {
  rmSync(root, { recursive: true, force: true });
});

test("resolveGlob finds files matching a recursive pattern, scoped to the static root", () => {
  const matches = resolveGlob("docs/**/*.md", root);
  assert.deepEqual(matches.sort(), ["docs/nested/two.md", "docs/one.md"]);
});

test("resolveGlob ignores node_modules by default", () => {
  const matches = resolveGlob("**/*.md", root);
  assert.ok(!matches.includes("node_modules/some-pkg/readme.md"));
  assert.ok(matches.includes("README.md"));
});

test("resolveGlob treats a pattern with no wildcard as a literal path", () => {
  assert.deepEqual(resolveGlob("README.md", root), ["README.md"]);
  assert.deepEqual(resolveGlob("does-not-exist.md", root), []);
});

test("resolveGlobs dedupes and sorts across overlapping patterns", () => {
  const matches = resolveGlobs(["docs/*.md", "docs/**/*.md"], root);
  assert.deepEqual(matches, ["docs/nested/two.md", "docs/one.md"]);
});

test("resolveGlob returns nothing for a pattern that matches no files", () => {
  assert.deepEqual(resolveGlob("docs/**/*.rst", root), []);
});
