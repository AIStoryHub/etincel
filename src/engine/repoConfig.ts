/**
 * Repo-local config: dictionary as code. A team's banned/allowed words
 * currently live only in a per-user account row, invisible to code review,
 * not versioned, gone when the person leaves. A `.etincelrc` (or
 * `.etincelrc.json` / `etincel.config.json`) committed to the repo fixes
 * that for the local stdio server and the `etincel lint` CLI, both of which
 * have a real filesystem/cwd to look in (the hosted server does not, and
 * intentionally doesn't use this).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Register, Tier } from "./score.js";

const CONFIG_FILENAMES = [".etincelrc", ".etincelrc.json", "etincel.config.json"];
const VALID_REGISTERS: Register[] = ["email", "blog", "memo", "essay", "social", "docs", "general"];
const VALID_TIERS: Tier[] = ["green", "yellow", "orange", "red"];

export interface RepoConfig {
  /** Absolute path to the config file that was loaded, so callers can tell
   * the user where a rule came from. */
  path: string;
  bannedWords: string[];
  allowedWords: string[];
  register?: Register;
  threshold?: Tier;
}

function stringArray(obj: Record<string, unknown>, key: string, path: string): string[] {
  const value = obj[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`Invalid "${key}" in ${path}: expected an array of strings.`);
  }
  return value;
}

function parseConfig(path: string, raw: string): RepoConfig {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`Invalid config in ${path}: expected a JSON object.`);
  }
  const obj = data as Record<string, unknown>;

  if (obj.register !== undefined && !VALID_REGISTERS.includes(obj.register as Register)) {
    throw new Error(`Invalid "register" in ${path}: expected one of ${VALID_REGISTERS.join(", ")}.`);
  }
  if (obj.threshold !== undefined && !VALID_TIERS.includes(obj.threshold as Tier)) {
    throw new Error(`Invalid "threshold" in ${path}: expected one of ${VALID_TIERS.join(", ")}.`);
  }

  return {
    path,
    bannedWords: stringArray(obj, "bannedWords", path),
    allowedWords: stringArray(obj, "allowedWords", path),
    register: obj.register as Register | undefined,
    threshold: obj.threshold as Tier | undefined,
  };
}

/**
 * Walks up from startDir looking for a repo-local config file, checked in
 * CONFIG_FILENAMES order at each directory. Stops once a directory
 * containing `.git` has been checked (the repo root) or the filesystem root
 * is reached, so it never reads a config from outside the current repo.
 * Returns undefined if none is found. Throws, rather than silently
 * ignoring, if a config file exists but is malformed. `dictionary as code`
 * that fails quietly on a typo defeats the point.
 */
export function findRepoConfig(startDir: string): RepoConfig | undefined {
  let dir = resolve(startDir);
  for (;;) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = join(dir, filename);
      if (existsSync(candidate)) {
        return parseConfig(candidate, readFileSync(candidate, "utf8"));
      }
    }
    if (existsSync(join(dir, ".git"))) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
