/**
 * Minimal, dependency-free glob resolution for the CLI: supports `*` (any
 * run of characters within one path segment), `**` (any number of path
 * segments, including zero), and `?` (one character). No brace expansion,
 * no character classes. That covers the documented `etincel lint` use
 * cases (`docs/**\/*.md`, `src/*.ts`, a literal file) without pulling in a
 * dependency for a tool this small.
 */
import { readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

const DEFAULT_IGNORE_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".turbo"]);

function escapeRegExpChar(c: string): string {
  return "\\^$+.()|[]{}".includes(c) ? `\\${c}` : c;
}

/** Converts a glob pattern (forward-slash separated) into a RegExp matching
 * a POSIX-style relative path. */
export function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") i++;
        re += "(?:.*/)?";
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += escapeRegExpChar(c);
    }
  }
  return new RegExp(`^${re}$`);
}

/** The path segments before the first wildcard segment, used to scope the
 * filesystem walk instead of scanning the whole tree for every pattern. */
function staticRoot(pattern: string): string {
  const staticSegments: string[] = [];
  for (const segment of pattern.split("/")) {
    if (segment.includes("*") || segment.includes("?")) break;
    staticSegments.push(segment);
  }
  return staticSegments.join("/") || ".";
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
}

function toPosixRelative(cwd: string, fullPath: string): string {
  return relative(cwd, fullPath).split(sep).join("/");
}

/** Resolves one glob pattern against cwd into relative (POSIX-style) file
 * paths. A pattern with no wildcard is treated as a literal path: returned
 * if it names an existing file, empty otherwise (so a typo'd literal path
 * fails the same way an unmatched glob does, not with an ENOENT crash).
 *
 * An absolute pattern (e.g. from `find /repo -name '*.md'` or a caller that
 * already resolved its own paths) is used as-is rather than joined onto
 * cwd: `path.join(cwd, pattern)` doesn't special-case an absolute second
 * argument the way `path.resolve` does, so joining silently nested the
 * absolute path under cwd (`/repo` + `/Users/x/README.md` became
 * `/repo/Users/x/README.md`, which never exists). */
export function resolveGlob(pattern: string, cwd: string): string[] {
  if (!/[*?]/.test(pattern)) {
    const target = isAbsolute(pattern) ? pattern : join(cwd, pattern);
    try {
      if (statSync(target).isFile()) return [toPosixRelative(cwd, target)];
    } catch {
      // no match
    }
    return [];
  }

  const root = staticRoot(pattern);
  const walkRoot = isAbsolute(root) ? root : join(cwd, root);
  const files: string[] = [];
  walk(walkRoot, files);
  const regex = globToRegExp(pattern);
  // An absolute pattern's regex expects to match a full POSIX path (it was
  // never made cwd-relative), so match against that instead of a
  // cwd-relative path; a relative pattern matches as before.
  const matchTarget = isAbsolute(pattern)
    ? (f: string) => f.split(sep).join("/")
    : (f: string) => toPosixRelative(cwd, f);
  return files.filter((f) => regex.test(matchTarget(f))).map((f) => toPosixRelative(cwd, f));
}

/** Resolves multiple patterns, deduped and sorted. */
export function resolveGlobs(patterns: string[], cwd: string): string[] {
  const seen = new Set<string>();
  for (const pattern of patterns) {
    for (const file of resolveGlob(pattern, cwd)) seen.add(file);
  }
  return [...seen].sort();
}
