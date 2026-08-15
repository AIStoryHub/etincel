import { auditText, type Register } from "../engine/score.js";
import { dedupeWords, GLOBAL_DICTIONARY_SCOPE, type DictionaryStore } from "../engine/dictionaryStore.js";
import { guardStrengthsNotes } from "../engine/strengthsConfidence.js";

/** Merges the global dictionary with a style-scoped one (if given and
 * distinct from global) into the flat word lists auditText() takes. */
async function effectiveDictionary(store: DictionaryStore, styleId?: string) {
  const global = await store.getDictionary(GLOBAL_DICTIONARY_SCOPE);
  if (!styleId || styleId === GLOBAL_DICTIONARY_SCOPE) {
    return { bannedWords: global.bannedWords, allowedWords: global.allowedWords };
  }
  const scoped = await store.getDictionary(styleId);
  return {
    bannedWords: dedupeWords([...global.bannedWords, ...scoped.bannedWords]),
    allowedWords: dedupeWords([...global.allowedWords, ...scoped.allowedWords]),
  };
}

export async function auditTextTool(
  store: DictionaryStore,
  text: string,
  register?: Register,
  styleId?: string,
  /** Repo-local config's word lists (see src/engine/repoConfig.ts), merged
   * in alongside the account/style dictionary. Only the local stdio server
   * passes this, since it's the only transport with a real repo/cwd to look
   * in; the hosted server never does. */
  extra?: { bannedWords?: string[]; allowedWords?: string[] },
  /** Elicited answers from SKILL.md's Step 0.5, see
   * src/engine/elicitedMaterial.ts. Omit when Step 0.5 wasn't run. */
  sourceFacts?: string[]
) {
  if (!text || text.trim().length === 0) {
    throw new Error("Nothing to audit: text was empty.");
  }
  const { bannedWords, allowedWords } = await effectiveDictionary(store, styleId);
  const mergedBannedWords = dedupeWords([...(extra?.bannedWords ?? []), ...bannedWords]);
  const mergedAllowedWords = dedupeWords([...(extra?.allowedWords ?? []), ...allowedWords]);
  const result = auditText(text, {
    extraBannedWords: mergedBannedWords,
    allowedWords: mergedAllowedWords,
    register,
    sourceFacts,
  });
  const scoredFindings = result.findings.filter((f) => f.scored);
  return {
    tier: result.tier,
    score: result.score,
    wordCount: result.wordCount,
    register: register ?? "general",
    styleId: styleId ?? null,
    findingCount: scoredFindings.length,
    findings: scoredFindings,
    categoryBreakdown: result.categoryBreakdown,
    summary: result.summary,
    strengths: guardStrengthsNotes(result.strengths, result.wordCount),
  };
}
