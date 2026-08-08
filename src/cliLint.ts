/**
 * Core logic for `etincel lint`, kept free of process.exit/console calls so
 * it's directly unit-testable. src/cli.ts is the thin executable wrapper
 * that wires this to argv/stdout/exit codes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditText, type Tier, type Register } from "./engine/score.js";
import { resolveGlobs } from "./cliGlob.js";
import { findRepoConfig } from "./engine/repoConfig.js";

const TIER_ORDER: Tier[] = ["green", "yellow", "orange", "red"];
const VALID_REGISTERS: Register[] = ["email", "blog", "memo", "essay", "social", "docs", "general"];

export function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

export const USAGE = [
  "Usage: etincel-nonfiction lint <pattern...> [options]",
  "",
  "Audits each matched file for AI writing tells (494 checks, no network or",
  "model call). Exits non-zero if any file's tier is at or above --threshold.",
  "",
  "Options:",
  "  --threshold <tier>    green | yellow | orange | red (default: orange, or",
  "                        a repo-local config's own threshold if it sets one)",
  "  --register <register> email | blog | memo | essay | social | docs | general",
  "                        (default: 'docs' for .md/.mdx files, unset otherwise;",
  "                        a repo-local config's register applies in between)",
  "  --json                emit a single JSON report instead of text",
  "  --help, -h             show this message",
  "",
  "Reads a repo-local .etincelrc / .etincelrc.json / etincel.config.json if one",
  "exists at or above the current directory (bannedWords, allowedWords, and",
  "optionally register/threshold defaults): dictionary as code, reviewable",
  "and versioned instead of living only in an account setting.",
  "",
  "Examples:",
  "  npx etincel-nonfiction lint 'docs/**/*.md'",
  "  npx etincel-nonfiction lint README.md --register docs --threshold yellow",
].join("\n");

export interface LintOptions {
  patterns: string[];
  /** Explicit --threshold, if passed. Falls back to a repo config's own
   * threshold, then "orange", inside runLint. */
  threshold?: Tier;
  /** Explicit --register, if passed. Falls back to a repo config's own
   * register, then the .md/.mdx default, inside runLint. */
  register?: Register;
  format: "text" | "json";
}

export type ParsedArgs = { kind: "run"; options: LintOptions } | { kind: "help" } | { kind: "error"; message: string };

/** Pure argv parser: no I/O, no process.exit. argv is everything after the
 * "lint" subcommand itself (src/cli.ts strips that off first). */
export function parseLintArgs(argv: string[]): ParsedArgs {
  const patterns: string[] = [];
  let threshold: Tier | undefined;
  let register: Register | undefined;
  let format: LintOptions["format"] = "text";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    } else if (arg === "--threshold") {
      const value = argv[++i];
      if (!TIER_ORDER.includes(value as Tier)) {
        return { kind: "error", message: `Invalid --threshold "${value}". Expected one of: ${TIER_ORDER.join(", ")}.` };
      }
      threshold = value as Tier;
    } else if (arg === "--register") {
      const value = argv[++i];
      if (!VALID_REGISTERS.includes(value as Register)) {
        return { kind: "error", message: `Invalid --register "${value}". Expected one of: ${VALID_REGISTERS.join(", ")}.` };
      }
      register = value as Register;
    } else if (arg === "--json") {
      format = "json";
    } else if (arg.startsWith("--")) {
      return { kind: "error", message: `Unknown flag "${arg}".` };
    } else {
      patterns.push(arg);
    }
  }

  if (patterns.length === 0) {
    return { kind: "error", message: "Nothing to lint: pass at least one file or glob pattern." };
  }

  return { kind: "run", options: { patterns, threshold, register, format } };
}

function registerFor(filePath: string, override: Register | undefined): Register | undefined {
  if (override) return override;
  return /\.mdx?$/i.test(filePath) ? "docs" : undefined;
}

export interface FileLintResult {
  file: string;
  score: number;
  tier: Tier;
  wordCount: number;
  findingCount: number;
  topFindings: { term: string; count: number }[];
}

export interface LintReport {
  threshold: Tier;
  files: FileLintResult[];
  failing: FileLintResult[];
  /** Path to the repo-local config that was loaded, if any. */
  configPath?: string;
}

/** Resolves patterns against cwd, audits every matched file, and reports
 * which ones are at or above threshold. Reads files (and, if present, a
 * repo-local .etincelrc) from disk; otherwise pure (no console output, no
 * process.exit; src/cli.ts owns that). A malformed repo config throws,
 * same as any other bad input here. */
export function runLint(options: LintOptions, cwd: string): LintReport {
  const repoConfig = findRepoConfig(cwd);
  const threshold = options.threshold ?? repoConfig?.threshold ?? "orange";
  const registerOverride = options.register ?? repoConfig?.register;
  const extraBannedWords = repoConfig?.bannedWords ?? [];
  const allowedWords = repoConfig?.allowedWords ?? [];

  const matched = resolveGlobs(options.patterns, cwd);
  const files: FileLintResult[] = matched.map((file) => {
    const text = readFileSync(join(cwd, file), "utf8");
    const result = auditText(text, {
      register: registerFor(file, registerOverride),
      extraBannedWords,
      allowedWords,
    });
    const scored = result.findings.filter((f) => f.scored);
    return {
      file,
      score: result.score,
      tier: result.tier,
      wordCount: result.wordCount,
      findingCount: scored.length,
      topFindings: scored.slice(0, 3).map((f) => ({ term: f.term, count: f.count })),
    };
  });
  const failing = files.filter((f) => tierRank(f.tier) >= tierRank(threshold));
  return { threshold, files, failing, configPath: repoConfig?.path };
}

const TIER_LABEL: Record<Tier, string> = { green: "GREEN", yellow: "YELLOW", orange: "ORANGE", red: "RED" };

export function formatText(report: LintReport): string {
  const lines: string[] = [];
  if (report.configPath) {
    lines.push(`Using config: ${report.configPath}`);
    lines.push("");
  }
  for (const f of report.files) {
    const flag = tierRank(f.tier) >= tierRank(report.threshold) ? "✗" : "✓";
    lines.push(`${flag} ${f.file}  ${TIER_LABEL[f.tier]} ${f.score}/100  (${f.findingCount} finding${f.findingCount === 1 ? "" : "s"})`);
    for (const finding of f.topFindings) {
      lines.push(`    - ${finding.term}${finding.count > 1 ? ` ×${finding.count}` : ""}`);
    }
  }
  lines.push("");
  lines.push(`${report.files.length} file${report.files.length === 1 ? "" : "s"} audited, ${report.failing.length} at or above ${report.threshold}.`);
  return lines.join("\n");
}

export function formatJson(report: LintReport): string {
  return JSON.stringify(
    {
      threshold: report.threshold,
      configPath: report.configPath ?? null,
      failingCount: report.failing.length,
      files: report.files,
    },
    null,
    2
  );
}
