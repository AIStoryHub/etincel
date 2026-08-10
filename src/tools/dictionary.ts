import { GLOBAL_DICTIONARY_SCOPE, dedupeWords, type Dictionary, type DictionaryStore } from "../engine/dictionaryStore.js";
import { sanitizeFreeformText } from "../engine/sanitizeText.js";

function resolveScope(styleId?: string): string {
  const trimmed = sanitizeFreeformText(styleId?.trim() ?? "");
  return trimmed.length > 0 ? trimmed : GLOBAL_DICTIONARY_SCOPE;
}

function requireWord(word: string): string {
  const trimmed = word?.trim();
  if (!trimmed) throw new Error("Word cannot be empty.");
  return trimmed;
}

export function createDictionaryTools(store: DictionaryStore) {
  async function addBannedWordTool(word: string, styleId?: string): Promise<Dictionary> {
    return store.addBannedWord(resolveScope(styleId), requireWord(word));
  }

  async function removeBannedWordTool(word: string, styleId?: string): Promise<Dictionary> {
    return store.removeBannedWord(resolveScope(styleId), requireWord(word));
  }

  async function addCustomWordTool(word: string, styleId?: string): Promise<Dictionary> {
    return store.addAllowedWord(resolveScope(styleId), requireWord(word));
  }

  async function removeCustomWordTool(word: string, styleId?: string): Promise<Dictionary> {
    return store.removeAllowedWord(resolveScope(styleId), requireWord(word));
  }

  async function listDictionaryTool(styleId?: string) {
    const scope = resolveScope(styleId);
    const dict = await store.getDictionary(scope);
    if (scope === GLOBAL_DICTIONARY_SCOPE) {
      return { scope, bannedWords: dict.bannedWords, allowedWords: dict.allowedWords };
    }
    const global = await store.getDictionary(GLOBAL_DICTIONARY_SCOPE);
    return {
      scope,
      bannedWords: dict.bannedWords,
      allowedWords: dict.allowedWords,
      // What actually applies when auditing with this style selected: this
      // scope's words plus whatever's in "global".
      effective: {
        bannedWords: dedupeWords([...global.bannedWords, ...dict.bannedWords]),
        allowedWords: dedupeWords([...global.allowedWords, ...dict.allowedWords]),
      },
    };
  }

  return {
    addBannedWordTool,
    removeBannedWordTool,
    addCustomWordTool,
    removeCustomWordTool,
    listDictionaryTool,
  };
}
