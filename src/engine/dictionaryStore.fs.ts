import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ensureDirs, DICTIONARIES_PATH } from "./paths.js";
import { dedupeWords, removeWord, emptyDictionary, type Dictionary, type DictionaryStore } from "./dictionaryStore.js";

interface StoredDictionary {
  bannedWords: string[];
  allowedWords: string[];
  updatedAt: string;
}

type StoredDictionaries = Record<string, StoredDictionary>;

function readAll(): StoredDictionaries {
  ensureDirs();
  if (!existsSync(DICTIONARIES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DICTIONARIES_PATH, "utf8")) as StoredDictionaries;
  } catch {
    return {};
  }
}

function writeAll(data: StoredDictionaries): void {
  ensureDirs();
  writeFileSync(DICTIONARIES_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function getDictionary(scope: string): Promise<Dictionary> {
  const entry = readAll()[scope];
  return entry ? { scope, ...entry } : emptyDictionary(scope);
}

async function setDictionary(
  scope: string,
  dict: { bannedWords: string[]; allowedWords: string[] }
): Promise<Dictionary> {
  const all = readAll();
  const record: StoredDictionary = {
    bannedWords: dedupeWords(dict.bannedWords),
    allowedWords: dedupeWords(dict.allowedWords),
    updatedAt: new Date().toISOString(),
  };
  all[scope] = record;
  writeAll(all);
  return { scope, ...record };
}

async function addBannedWord(scope: string, word: string): Promise<Dictionary> {
  const current = await getDictionary(scope);
  return setDictionary(scope, { bannedWords: [...current.bannedWords, word], allowedWords: current.allowedWords });
}

async function removeBannedWord(scope: string, word: string): Promise<Dictionary> {
  const current = await getDictionary(scope);
  return setDictionary(scope, {
    bannedWords: removeWord(current.bannedWords, word),
    allowedWords: current.allowedWords,
  });
}

async function addAllowedWord(scope: string, word: string): Promise<Dictionary> {
  const current = await getDictionary(scope);
  return setDictionary(scope, { bannedWords: current.bannedWords, allowedWords: [...current.allowedWords, word] });
}

async function removeAllowedWord(scope: string, word: string): Promise<Dictionary> {
  const current = await getDictionary(scope);
  return setDictionary(scope, {
    bannedWords: current.bannedWords,
    allowedWords: removeWord(current.allowedWords, word),
  });
}

export const fsDictionaryStore: DictionaryStore = {
  getDictionary,
  addBannedWord,
  removeBannedWord,
  addAllowedWord,
  removeAllowedWord,
  setDictionary,
};
