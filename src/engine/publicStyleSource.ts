import type { StyleSeed } from "./voiceStore.js";

/** A StyleSeed plus the style-scoped dictionary/instructions rows a fork
 * should carry over: what the source installer set specifically for this
 * voice (never their account-wide "global" scope, which stays private, see
 * publishStore.neon.ts's getPublicStyle). Absent rows come back as empty,
 * never undefined, so a caller can fork without a null check. */
export interface PublicStyleForFork extends StyleSeed {
  bannedWords: string[];
  customWords: string[];
  instructions: string;
}

/**
 * Looks up a style someone has published publicly (see the hosted web
 * app's /v/{handle}/{slug} pages): a preset, or another installer's
 * trained voice they've chosen to make forkable by anyone. Distinct from
 * PresetSource, which only ever knows about this install's bundled or
 * account-scoped presets, never another installer's voices.
 */
export interface PublicStyleSource {
  getPublicStyle(handle: string, slug: string): Promise<PublicStyleForFork | undefined>;
}

const REF_PATTERN = /^([a-z][a-z0-9-]{2,31})\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** A public style is addressed as "handle/slug", the same shape as its
 * public URL path (/v/{handle}/{slug}) with the leading /v/ dropped. A
 * bare preset id like "founder-memo" never matches: preset ids have no
 * "/", so fork_style can try a preset first and fall back to this only
 * when the id looks like a public ref at all. */
export function parsePublicStyleRef(id: string): { handle: string; slug: string } | undefined {
  const match = REF_PATTERN.exec(id.trim());
  return match ? { handle: match[1], slug: match[2] } : undefined;
}
