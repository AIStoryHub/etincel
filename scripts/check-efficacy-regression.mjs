#!/usr/bin/env node
/**
 * Runs assay's efficacy check across every register tracked in
 * efficacy-baselines.json (calibrated: docs/blog/memo/essay; deliberately
 * uncalibrated but still watched: email/general, 'social' has no labeled
 * corpus at all, see src/data/SOURCES.md's 2026-08-10 entry, so it isn't
 * checked here) and reports whether any register's pooled AUC dropped
 * below its last known-good value.
 *
 * AUC is deterministic (same code + same corpus + same bootstrap seed
 * always reproduce the same number), so any drop is a real regression this
 * PR caused, not measurement noise, there's no tolerance margin to tune.
 *
 * Non-blocking by design (exits 0 even on a regression) until this check
 * has an established track record, the same reasoning
 * .circleci/config.yml's lint-prose job already documents for itself. Set
 * EFFICACY_GATE_STRICT=1 to make a real regression fail the job instead.
 *
 * Usage:
 *   node scripts/check-efficacy-regression.mjs [--ref <git-ref-or-sha>]
 *
 * Requires a checkout of github.com/AIStoryHub/assay at ASSAY_DIR (default:
 * a fresh clone into a temp dir, deleted after the run), assay's efficacy
 * configs (examples/etincel-<register>-efficacy.config.js) do the actual
 * clean-room clone-and-build of THIS repo at the given ref.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const REF = arg("ref", process.env.ETINCEL_REF || process.env.GITHUB_SHA || process.env.CIRCLE_SHA1 || "main");
const STRICT = process.env.EFFICACY_GATE_STRICT === "1";

const baselines = JSON.parse(readFileSync(new URL("../efficacy-baselines.json", import.meta.url)));
const registers = Object.keys(baselines.registers);

let assayDir = process.env.ASSAY_DIR;
let cleanupAssay = false;
if (!assayDir) {
  assayDir = mkdtempSync(join(tmpdir(), "assay-clone-"));
  cleanupAssay = true;
  process.stderr.write(`Cloning AIStoryHub/assay into ${assayDir}...\n`);
  execFileSync("git", ["clone", "--quiet", "--depth", "1", "https://github.com/AIStoryHub/assay.git", assayDir]);
  execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: assayDir, stdio: "inherit" });
}

const results = [];
try {
  for (const register of registers) {
    const configPath = join(assayDir, "examples", `etincel-${register}-efficacy.config.js`);
    if (!existsSync(configPath)) {
      process.stderr.write(`No config found for register "${register}" at ${configPath}, skipping.\n`);
      continue;
    }
    const outDir = join(assayDir, `out-${register}`);
    process.stderr.write(`\n. ${register} (ref: ${REF})\n`);
    execFileSync("node", ["bin/assay.js", "run", configPath, "--only", "efficacy", "--out", outDir], {
      cwd: assayDir,
      env: { ...process.env, ETINCEL_REF: REF },
      stdio: "inherit",
    });
    const report = JSON.parse(readFileSync(join(outDir, "assay.json"), "utf8"));
    const auc = report.efficacy?.pooled?.auc ?? null;
    results.push({ register, auc, baseline: baselines.registers[register] });
  }
} finally {
  if (cleanupAssay) rmSync(assayDir, { recursive: true, force: true });
}

// Baselines are stored rounded to 4 decimal places, so a live computation
// (full precision) will almost always show a tiny nonzero delta against the
// stored value even with byte-identical code and corpus, that's rounding
// distance, not a real regression. EPSILON is half that rounding step, wide
// enough to absorb it without hiding a genuine drop.
const EPSILON = 0.0005;

process.stderr.write("\n=== Efficacy regression report ===\n");
let anyRegression = false;
for (const { register, auc, baseline } of results) {
  if (auc === null) {
    process.stderr.write(`${register.padEnd(10)} FAILED TO MEASURE\n`);
    anyRegression = true;
    continue;
  }
  const delta = auc - baseline;
  const flag = delta < -EPSILON ? "REGRESSION" : delta > EPSILON ? "improved" : "unchanged";
  if (delta < -EPSILON) anyRegression = true;
  process.stderr.write(
    `${register.padEnd(10)} baseline=${baseline.toFixed(4)}  now=${auc.toFixed(4)}  delta=${delta >= 0 ? "+" : ""}${delta.toFixed(4)}  ${flag}\n`
  );
}

if (anyRegression) {
  process.stderr.write(
    "\nOne or more registers regressed. If intentional (e.g. you recalibrated a register on purpose), " +
    "update efficacy-baselines.json in this PR. If not, this is a real signal something in this change " +
    "hurt detection for that register.\n"
  );
  process.exit(STRICT ? 1 : 0);
}

process.stderr.write("\nNo regressions.\n");
process.exit(0);
