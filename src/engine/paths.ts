import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export const ETINCEL_HOME = process.env.ETINCEL_HOME ?? join(homedir(), ".etincel");
export const VOICES_DIR = join(ETINCEL_HOME, "voices");
export const CONFIG_PATH = join(ETINCEL_HOME, "config.json");
export const DICTIONARIES_PATH = join(ETINCEL_HOME, "dictionaries.json");
export const INSTRUCTIONS_PATH = join(ETINCEL_HOME, "instructions.json");

export function ensureDirs(): void {
  mkdirSync(VOICES_DIR, { recursive: true });
}
