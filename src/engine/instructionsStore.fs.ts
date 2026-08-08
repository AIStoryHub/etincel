import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ensureDirs, INSTRUCTIONS_PATH } from "./paths.js";
import { emptyInstructions, type StyleInstructions, type InstructionsStore } from "./instructionsStore.js";
import { sanitizeFreeformText } from "./sanitizeText.js";

interface StoredInstructions {
  instructions: string;
  updatedAt: string;
}

type StoredAll = Record<string, StoredInstructions>;

function readAll(): StoredAll {
  ensureDirs();
  if (!existsSync(INSTRUCTIONS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(INSTRUCTIONS_PATH, "utf8")) as StoredAll;
  } catch {
    return {};
  }
}

function writeAll(data: StoredAll): void {
  ensureDirs();
  writeFileSync(INSTRUCTIONS_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function getInstructions(scope: string): Promise<StyleInstructions> {
  const entry = readAll()[scope];
  return entry ? { scope, ...entry } : emptyInstructions(scope);
}

async function setInstructions(scope: string, instructions: string): Promise<StyleInstructions> {
  const all = readAll();
  const record: StoredInstructions = {
    instructions: sanitizeFreeformText(instructions.trim()),
    updatedAt: new Date().toISOString(),
  };
  all[scope] = record;
  writeAll(all);
  return { scope, ...record };
}

export const fsInstructionsStore: InstructionsStore = {
  getInstructions,
  setInstructions,
};
