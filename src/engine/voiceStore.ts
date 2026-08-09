import type { TextStats } from "./textStats.js";
import type { StyleDials } from "./dials.js";
import type { Preset } from "./presets.js";

/** One training sample's own fingerprint (not the merged/aggregate stats):
 * its opening words and its own characteristic bigrams. Powers self-
 * repetition detection (see selfRepetition.ts): comparing a new draft
 * against a voice's actual past openers and phrasing, not just its
 * aggregate rhythm. */
export interface SampleFingerprint {
  /** When this sample was added, so a finding can cite real recency. */
  trainedAt: string;
  /** First few words, normalized. See selfRepetition.ts's extractOpener,
   * the same function used to normalize a draft being checked. */
  opener: string;
  /** This sample's own lift-ranked bigrams (see textStats.ts's
   * topBigrams), computed before merging into the voice's aggregate. */
  topBigrams: string[];
}

export interface VoiceProfile {
  /** Opaque unique identifier, assigned once at creation and stable across
   * renames. Never derived from `name`, so it never collides with, or
   * drifts from, whatever the voice is currently called. */
  id: string;
  /** Short, memorable, human-typeable stand-in for `id` (e.g. "K7M2X"),
   * shown in the UI in place of the raw UUID. Assigned once at creation
   * alongside `id` and stable across renames for the same reason. See
   * shortId.ts. */
  shortId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** 0 for a voice created from dials rather than measured from samples. */
  sampleCount: number;
  stats: TextStats;
  guide: string;
  /** Persona dials (0-10, matching presets.json's scale). Undefined on
   * voices trained before these existed. The UI defaults to 5 (neutral). */
  formality?: number;
  warmth?: number;
  directness?: number;
  /** Recent training samples' fingerprints, most recent last, capped (see
   * MAX_HISTORY in voiceStore.fs.ts). Only populated by the local (stdio)
   * store: the hosted store leaves this undefined rather than requiring a
   * schema change to the voices table for a first pass, so
   * check_self_repetition always has something safe to read (an empty
   * history reads as "nothing to compare yet," not an error). */
  history?: SampleFingerprint[];
}

/** The minimum needed to seed a new trained voice from an existing style's
 * guide and persona: forkFromPreset and forkFromGuide both reset mechanics
 * to defaults (keeping only entropy for a preset) rather than trying to
 * preserve the source's exact measured rhythm, since a published public
 * style never exposes its exact mechanical dials in the first place, only
 * formality/warmth/directness (see the hosted web app's PublicStyle type
 * in web/lib/publishStore.neon.ts). */
export interface StyleSeed {
  guide: string;
  formality: number;
  warmth: number;
  directness: number;
}

/**
 * Storage for trained voices and per-installer config. The local (stdio)
 * server backs this with a file under ~/.etincel; the hosted (Vercel) server
 * backs it with a Postgres row scoped to the authenticated installer.
 */
export interface VoiceStore {
  /** Trains a voice from writing samples. Calling this again, either with
   * the same name, or with `id` set to an existing voice's id, accumulates
   * onto that voice instead of replacing it: the new samples' mechanical
   * stats merge word-count-weighted with what's already measured, so a
   * voice keeps sharpening as more samples come in rather than forgetting
   * its prior training. `id` is a stable, opaque identifier assigned once
   * at creation, independent of `name`, so a voice keeps the same id
   * across renames. Pass `id` to target a specific voice precisely once
   * its display name may no longer match what it was created under; when
   * `id` is given, no matching voice is an error rather than silently
   * creating a new one under a different id. */
  trainVoice(name: string, samples: string[], id?: string): Promise<VoiceProfile>;
  /** Synthesizes a voice from dials.ts sliders instead of measuring real
   * writing. See src/engine/dials.ts for the mapping. */
  createFromDials(name: string, dials: StyleDials): Promise<VoiceProfile>;
  /** Edits an existing voice in place, same id, so existing routes and the
   * default-style pointer keep working after a rename. Persona dials always
   * apply; the mechanical dials only apply when the voice has no samples
   * (sampleCount === 0). A sample-trained voice keeps its measured
   * mechanical stats regardless of what's passed here. */
  updateVoice(id: string, name: string, dials: StyleDials): Promise<VoiceProfile>;
  /** Seeds a new trained voice from a preset: copies its persona dials and
   * folds its guide text in verbatim (rather than regenerating a mechanical
   * description), so the fork keeps the preset's drafting instructions
   * until the user retrains it from real samples or edits the dials. */
  forkFromPreset(preset: Preset, name: string): Promise<VoiceProfile>;
  /** Seeds a new trained voice from a published public style (see
   * publicStyleSource.ts): another installer's voice, or a preset,
   * addressed by its public "handle/slug" rather than a local id. Same
   * shape as forkFromPreset, guide folded in verbatim, mechanics reset to
   * defaults, since that's all a public style ever exposes. */
  forkFromGuide(seed: StyleSeed, name: string): Promise<VoiceProfile>;
  loadVoice(id: string): Promise<VoiceProfile | undefined>;
  listVoices(): Promise<VoiceProfile[]>;
  deleteVoice(id: string): Promise<boolean>;
  getDefaultStyleId(): Promise<string | undefined>;
  setDefaultStyleId(id: string): Promise<void>;
}
