/**
 * User-editable word lists layered on top of the built-in banned/soft-flag
 * corpora (src/data/banned-terms.json, soft-flag-terms.json). Two kinds:
 *  - bannedWords: extra terms to flag as hard bans, same as a corpus entry.
 *  - allowedWords: terms that should never be flagged, even if they match a
 *    built-in or custom-banned entry: the "corporate dictionary" case,
 *    e.g. an org's own acronyms.
 *
 * Each dictionary is stored under a "scope": either "global" (applies to
 * every style) or a style id (a trained voice or preset id), which is
 * merged on top of "global" when auditing with that style selected. This
 * mirrors VoiceStore's per-installer isolation: the local (stdio) server
 * backs it with a file under ~/.etincel, the hosted (Vercel) server with a
 * Postgres row scoped to the authenticated installer.
 */

export interface Dictionary {
  scope: string;
  bannedWords: string[];
  allowedWords: string[];
  updatedAt: string;
}

export const GLOBAL_DICTIONARY_SCOPE = "global";

/** Case-insensitive de-dup that keeps the first-seen casing. */
export function dedupeWords(words: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of words) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return Array.from(seen.values());
}

/** Case-insensitive removal of a single word from a list. */
export function removeWord(words: string[], word: string): string[] {
  const key = word.trim().toLowerCase();
  return words.filter((w) => w.toLowerCase() !== key);
}

export function emptyDictionary(scope: string): Dictionary {
  return { scope, bannedWords: [], allowedWords: [], updatedAt: new Date(0).toISOString() };
}

/**
 * Storage for per-installer word dictionaries, one per scope ("global" or a
 * style id). See the module doc comment above for how scopes merge.
 */
export interface DictionaryStore {
  getDictionary(scope: string): Promise<Dictionary>;
  addBannedWord(scope: string, word: string): Promise<Dictionary>;
  removeBannedWord(scope: string, word: string): Promise<Dictionary>;
  addAllowedWord(scope: string, word: string): Promise<Dictionary>;
  removeAllowedWord(scope: string, word: string): Promise<Dictionary>;
  /** Overwrites a scope's word lists outright: the primitive copy_dictionary
   * builds on. */
  setDictionary(scope: string, dict: { bannedWords: string[]; allowedWords: string[] }): Promise<Dictionary>;
}
