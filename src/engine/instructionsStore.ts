/**
 * User-authored free-text instructions layered on top of a style, separate
 * from voice (the dials/guide that describe *how* something sounds). This
 * is where "always include a CTA," "audience is technical," or "never
 * mention pricing" belongs: rules that hold across many pieces in a style
 * but aren't about sentence rhythm or tone. It follows the same shape as
 * DictionaryStore (see dictionaryStore.ts) so the two layer identically:
 * a "global" scope that applies everywhere, plus an optional style-scoped
 * override that merges on top of it.
 *
 * Deliberately not part of VoiceProfile.guide: that field is regenerated
 * wholesale on every train_style/create_style_from_dials/update_style call
 * (see voiceStore.fs.ts), so anything hand-written into it would be
 * silently lost on the next retrain. Instructions live in their own store
 * so they survive retraining untouched.
 */

export interface StyleInstructions {
  scope: string;
  instructions: string;
  updatedAt: string;
}

export const GLOBAL_INSTRUCTIONS_SCOPE = "global";

export function emptyInstructions(scope: string): StyleInstructions {
  return { scope, instructions: "", updatedAt: new Date(0).toISOString() };
}

/** Stacks global instructions under a style's own, the same "lower layer
 * sets the default, upper layer adds rules" order used by dictionary
 * merging. Blank pieces are dropped so an unused scope doesn't leave an
 * empty line behind. */
export function mergeInstructions(global: string, styleSpecific: string): string {
  return [global.trim(), styleSpecific.trim()].filter(Boolean).join("\n\n");
}

/**
 * Storage for per-installer style instructions, one per scope ("global" or
 * a style id). See the module doc comment above for how scopes merge.
 */
export interface InstructionsStore {
  getInstructions(scope: string): Promise<StyleInstructions>;
  setInstructions(scope: string, instructions: string): Promise<StyleInstructions>;
}
