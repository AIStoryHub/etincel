/**
 * Core logic for `etincel lint`, kept free of process.exit/console calls so
 * it's directly unit-testable. src/cli.ts is the thin executable wrapper
 * that wires this to argv/stdout/exit codes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditText, type AuditResult, type Finding, type FindingMatch, type Tier, type Register } from "./engine/score.js";
import { resolveGlobs } from "./cliGlob.js";
import { findRepoConfig } from "./engine/repoConfig.js";
import { buildLineStarts, offsetToLineCol } from "./engine/offsets.js";

const TIER_ORDER: Tier[] = ["green", "yellow", "orange", "red"];
const VALID_REGISTERS: Register[] = ["email", "blog", "memo", "essay", "social", "docs", "general", "personal"];

export function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

export const USAGE = [
  "Usage: etincel lint <pattern...> [options]",
  "",
  "Audits each matched file for AI writing tells (504 checks, no network or",
  "model call). Exits non-zero if any file's tier is at or above --threshold.",
  "",
  "Options:",
  "  --threshold <tier>    green | yellow | orange | red (default: orange, or",
  "                        a repo-local config's own threshold if it sets one)",
  "  --register <register> email | blog | memo | essay | social | docs | general | personal",
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
  "  npx etincel lint 'docs/**/*.md'",
  "  npx etincel lint README.md --register docs --threshold yellow",
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

/** A Finding with its character-offset matches (see engine/score.ts) resolved
 * to 1-indexed line/column, so text and --json output can point at a spot
 * in the file. Whole-piece findings (Whole-piece rhythm, Elicited material)
 * carry no matches upstream, so `matches` stays undefined for those. */
export interface LintFindingMatch extends FindingMatch {
  line: number;
  col: number;
}
export interface LintFinding extends Omit<Finding, "matches"> {
  matches?: LintFindingMatch[];
}

export interface FileLintResult {
  file: string;
  score: number;
  tier: Tier;
  wordCount: number;
  /** The register actually applied to this file (an explicit --register, a
   * repo config's, or the .md/.mdx default), if any. */
  register?: Register;
  findingCount: number;
  /** Every scored finding the engine returned, not a slice. */
  findings: LintFinding[];
  categoryBreakdown: { category: string; count: number }[];
  summary: string;
  strengths: AuditResult["strengths"];
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
    const register = registerFor(file, registerOverride);
    const result = auditText(text, {
      register,
      extraBannedWords,
      allowedWords,
    });
    const lineStarts = buildLineStarts(text);
    const findings: LintFinding[] = result.findings
      .filter((f) => f.scored)
      .map((f) => ({
        ...f,
        matches: f.matches?.map((m) => ({ ...m, ...offsetToLineCol(lineStarts, m.start) })),
      }));
    return {
      file,
      score: result.score,
      tier: result.tier,
      wordCount: result.wordCount,
      register,
      findingCount: findings.length,
      findings,
      categoryBreakdown: result.categoryBreakdown,
      summary: result.summary,
      strengths: result.strengths,
    };
  });
  const failing = files.filter((f) => tierRank(f.tier) >= tierRank(threshold));
  return { threshold, files, failing, configPath: repoConfig?.path };
}

const TIER_LABEL: Record<Tier, string> = { green: "GREEN", yellow: "YELLOW", orange: "ORANGE", red: "RED" };

const SEVERITY_ORDER: Record<Finding["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Finding.category values sourced from the vocabulary corpora (banned-terms /
// soft-flag-terms) plus a repo config's custom bans: single lowercase words,
// one per match, always carrying a `term`. Every other category comes from a
// structural detector (whole-piece rhythm, sentence-pattern regexes, etc.)
// whose `term` is a template shape, not a word, so `subcategory` is the
// readable label there instead. See engine/score.ts and
// engine/structural-detectors.ts.
const LEXICAL_CATEGORIES = new Set(["verb", "adjective", "noun", "filler", "imagery", "transition", "phrase", "custom"]);
const LEXICAL_GROUP_LABEL = "Vocabulary and phrasing";
const LEXICAL_FINDINGS_CAP = 20;
const WRAP_WIDTH = 76;

function isLexicalCategory(category: string): boolean {
  return LEXICAL_CATEGORIES.has(category);
}

function groupLabel(category: string): string {
  return isLexicalCategory(category) ? LEXICAL_GROUP_LABEL : category;
}

/** Whole-piece rhythm is the tool's core differentiator (prose *shape*, not
 * just word choice) and must never sort below vocabulary hits or get lost
 * off the bottom of the terminal. */
function isPriorityGroup(label: string): boolean {
  return /rhythm|structural/i.test(label);
}

function wrap(text: string, indent: string, width: number = WRAP_WIDTH): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && indent.length + next.length > width) {
      lines.push(indent + current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(indent + current);
  return lines;
}

function formatFinding(finding: LintFinding, lexical: boolean): string[] {
  const lines: string[] = [];
  const severity = finding.severity.padEnd(8);
  const label = lexical ? finding.term : finding.subcategory;
  const countSuffix = finding.count > 1 ? ` ×${finding.count}` : "";
  const match = finding.matches?.[0];
  const position = lexical && match ? `  L${match.line}:C${match.col}` : "";
  const hint = finding.replacementHint ? `  → ${finding.replacementHint}` : "";
  lines.push(`    ${severity}${label}${countSuffix}${position}${hint}`);
  if (finding.note) {
    lines.push(...wrap(finding.note, "            "));
  }
  return lines;
}

function formatFindingGroups(findings: LintFinding[]): string[] {
  const groups = new Map<string, LintFinding[]>();
  for (const finding of findings) {
    const label = groupLabel(finding.category);
    const bucket = groups.get(label);
    if (bucket) bucket.push(finding);
    else groups.set(label, [finding]);
  }

  const groupTotal = (label: string) => groups.get(label)!.reduce((sum, f) => sum + f.count, 0);
  const orderedLabels = Array.from(groups.keys()).sort((a, b) => {
    const aPriority = isPriorityGroup(a);
    const bPriority = isPriorityGroup(b);
    if (aPriority !== bPriority) return aPriority ? -1 : 1;
    return groupTotal(b) - groupTotal(a);
  });

  const lines: string[] = [];
  for (const label of orderedLabels) {
    const lexical = label === LEXICAL_GROUP_LABEL;
    const groupFindings = [...groups.get(label)!].sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      return severityDiff !== 0 ? severityDiff : b.count - a.count;
    });
    // Structural findings (rhythm, sentence patterns, formatting tells, ...)
    // always show in full; only the vocabulary bucket is capped, since a
    // slop-heavy file can otherwise surface dozens of individual word hits.
    const shown = lexical ? groupFindings.slice(0, LEXICAL_FINDINGS_CAP) : groupFindings;
    const omitted = groupFindings.length - shown.length;

    lines.push(`  ${label}`);
    for (const finding of shown) {
      lines.push(...formatFinding(finding, lexical));
    }
    if (omitted > 0) {
      lines.push(`    …and ${omitted} more (use --json for the full list)`);
    }
    lines.push("");
  }
  return lines;
}

export function formatText(report: LintReport): string {
  const lines: string[] = [];
  if (report.configPath) {
    lines.push(`Using config: ${report.configPath}`);
    lines.push("");
  }
  for (const f of report.files) {
    const flag = tierRank(f.tier) >= tierRank(report.threshold) ? "✗" : "✓";
    const registerNote = f.register ? `, register: ${f.register}` : "";
    lines.push(
      `${flag} ${f.file}  ${TIER_LABEL[f.tier]} ${f.score}/100  (${f.findingCount} finding${f.findingCount === 1 ? "" : "s"}, ${f.wordCount} word${f.wordCount === 1 ? "" : "s"}${registerNote})`
    );
    lines.push(...wrap(f.summary, "  "));
    lines.push("");
    if (f.findings.length > 0) {
      lines.push(...formatFindingGroups(f.findings));
    }
    const s = f.strengths;
    lines.push(
      `  strengths  specificity ${s.specificityPer1000Words.toFixed(1)}/1k · concrete:abstract ${s.concreteAbstractRatio.toFixed(2)} · burstiness ${s.sentenceBurstiness.toFixed(2)}`
    );
    for (const note of s.notes) {
      lines.push(...wrap(note, "             "));
    }
    lines.push("");
  }
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
