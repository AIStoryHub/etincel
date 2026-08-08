import { GLOBAL_DICTIONARY_SCOPE, dedupeWords, type Dictionary, type DictionaryStore } from "../engine/dictionaryStore.js";
import { staticPresetSource, type PresetSource } from "../engine/presets.js";
import type { VoiceStore } from "../engine/voiceStore.js";

/** "all" is the only reserved copy target; any other string is a literal
 * scope (a style id, or "global"). */
export const COPY_ALL_TARGET = "all";

function resolveScope(styleId?: string): string {
  const trimmed = styleId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : GLOBAL_DICTIONARY_SCOPE;
}

function requireWord(word: string): string {
  const trimmed = word?.trim();
  if (!trimmed) throw new Error("Word cannot be empty.");
  return trimmed;
}

export function createDictionaryTools(
  store: DictionaryStore,
  voiceStore?: VoiceStore,
  presetSource: PresetSource = staticPresetSource
) {
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

  /** Resolves every known scope this installer could copy a dictionary
   * into: "global" plus every trained/custom voice id and every preset id.
   * Presets are shared, not per-installer, but a preset id is still a valid
   * dictionary scope: an installer's own word list for "when I use
   * pr-review," so it's a legitimate copy target. */
  async function allKnownScopes(): Promise<string[]> {
    const voiceIds = voiceStore ? (await voiceStore.listVoices()).map((v) => v.id) : [];
    const presetIds = (await presetSource.listPresets()).map((p) => p.id);
    return Array.from(new Set([GLOBAL_DICTIONARY_SCOPE, ...voiceIds, ...presetIds]));
  }

  async function copyDictionaryTool(toScope: string, fromStyleId?: string) {
    const from = resolveScope(fromStyleId);
    const source = await store.getDictionary(from);

    let targets: string[];
    if (toScope === COPY_ALL_TARGET) {
      targets = (await allKnownScopes()).filter((s) => s !== from);
    } else {
      const target = resolveScope(toScope);
      if (target === from) {
        throw new Error(`Source and destination are the same scope ("${from}").`);
      }
      targets = [target];
    }

    if (targets.length === 0) {
      return { from, copiedTo: [] as string[] };
    }

    const results = await Promise.all(
      targets.map((scope) =>
        store.setDictionary(scope, { bannedWords: source.bannedWords, allowedWords: source.allowedWords })
      )
    );
    return { from, copiedTo: results.map((r) => r.scope) };
  }

  return {
    addBannedWordTool,
    removeBannedWordTool,
    addCustomWordTool,
    removeCustomWordTool,
    listDictionaryTool,
    copyDictionaryTool,
  };
}
