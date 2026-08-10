/**
 * Repo-local config: dictionary (and now instructions, and a shared style)
 * as code. A team's rules used to live only in per-user `~/.etincel/`,
 * invisible to code review, not versioned, gone when the person leaves. A
 * `.etincelrc` (or `.etincelrc.json` / `etincel.config.json`) committed to
 * the repo fixes that for the local stdio server and the `etincel lint`
 * CLI, both of which have a real filesystem/cwd to look in (the hosted
 * server does not, and intentionally doesn't use this). See also
 * ETINCEL_HOME (paths.ts) for pointing a whole team's local installs at one
 * shared directory instead of (or alongside) a committed `.etincelrc`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Register, Tier } from "./score.js";
import { MECHANICAL_DIAL_KEYS, type StyleDials } from "./dials.js";

const CONFIG_FILENAMES = [".etincelrc", ".etincelrc.json", "etincel.config.json"];
const VALID_REGISTERS: Register[] = ["email", "blog", "memo", "essay", "social", "docs", "general"];
const VALID_TIERS: Tier[] = ["green", "yellow", "orange", "red"];
const PERSONA_DIAL_KEYS = ["formality", "warmth", "directness"] as const;

/** Reserved style id a `.etincelrc`-defined style is addressed by: pass
 * this as styleId to get_style_guide (or check_voice_match/etc., once it's
 * been fork_style'd into a real trained voice) the same as any preset or
 * trained-voice id from list_styles. */
export const REPO_STYLE_ID = "team";

/** A style definition committed to `.etincelrc`, so a team shares one
 * "house voice" from day one instead of everyone hand-training or
 * hand-tuning their own. See REPO_STYLE_ID for how it's addressed. */
export interface RepoStyleConfig {
  name: string;
  dials: StyleDials;
}

export interface RepoConfig {
  /** Absolute path to the config file that was loaded, so callers can tell
   * the user where a rule came from. */
  path: string;
  bannedWords: string[];
  allowedWords: string[];
  register?: Register;
  threshold?: Tier;
  /** Free-text drafting rules that apply to every style, merged ahead of
   * the account-level global instructions (see instructionsStore.ts). The
   * team-wide equivalent of set_style_instructions with no styleId. */
  instructions?: string;
  style?: RepoStyleConfig;
}

function stringArray(obj: Record<string, unknown>, key: string, path: string): string[] {
  const value = obj[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`Invalid "${key}" in ${path}: expected an array of strings.`);
  }
  return value;
}

function parseStyle(obj: Record<string, unknown>, path: string): RepoStyleConfig | undefined {
  const value = obj.style;
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid "style" in ${path}: expected an object.`);
  }
  const styleObj = value as Record<string, unknown>;
  if (typeof styleObj.name !== "string" || styleObj.name.trim().length === 0) {
    throw new Error(`Invalid "style.name" in ${path}: expected a non-empty string.`);
  }
  const dialsValue = styleObj.dials;
  if (typeof dialsValue !== "object" || dialsValue === null || Array.isArray(dialsValue)) {
    throw new Error(`Invalid "style.dials" in ${path}: expected an object.`);
  }
  const dialsObj = dialsValue as Record<string, unknown>;
  const dials = {} as StyleDials;
  for (const key of PERSONA_DIAL_KEYS) {
    dials[key] = requireDial(dialsObj, key, 0, 10, path);
  }
  for (const key of MECHANICAL_DIAL_KEYS) {
    dials[key] = requireDial(dialsObj, key, 0, 100, path);
  }
  return { name: styleObj.name.trim(), dials };
}

function requireDial(obj: Record<string, unknown>, key: string, min: number, max: number, path: string): number {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    throw new Error(`Invalid "style.dials.${key}" in ${path}: expected a number between ${min} and ${max}.`);
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
  if (obj.instructions !== undefined && typeof obj.instructions !== "string") {
    throw new Error(`Invalid "instructions" in ${path}: expected a string.`);
  }

  return {
    path,
    bannedWords: stringArray(obj, "bannedWords", path),
    allowedWords: stringArray(obj, "allowedWords", path),
    register: obj.register as Register | undefined,
    threshold: obj.threshold as Tier | undefined,
    instructions: obj.instructions as string | undefined,
    style: parseStyle(obj, path),
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
