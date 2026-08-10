import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ensureDirs, VOICES_DIR, CONFIG_PATH } from "./paths.js";
import { computeTextStats, mergeStats, describeStats, type TextStats } from "./textStats.js";
import {
  dialsToStats,
  DEFAULT_MECHANICAL_DIALS,
  inferPersonaDials,
  personaGuideText,
  type StyleDials,
  type PersonaDials,
} from "./dials.js";
import { presetGuideText, type Preset } from "./presets.js";
import { extractOpener } from "./selfRepetition.js";
import { sanitizeFreeformText } from "./sanitizeText.js";
import { generateShortId } from "./shortId.js";
import type { VoiceStore, VoiceProfile, SampleFingerprint, StyleSeed } from "./voiceStore.js";

interface Config {
  defaultStyleId?: string;
}

/** How many recent training samples' fingerprints to keep for self-
 * repetition detection (see selfRepetition.ts). Bounded so a long-lived
 * voice's history file doesn't grow forever; "your last N pieces" is a
 * recency window by design, not a full archive. */
const MAX_HISTORY = 20;

/** A trained voice's guide is persona prose plus the measured mechanics,
 * not mechanics alone, see dials.ts's personaGuideText for why. sampleCount
 * gates describeStats' "distinctive word choices" line, see its own
 * MIN_SAMPLES_FOR_DISTINCTIVE_WORDS: 0 for a dial-built voice with no real
 * samples behind it. */
function composeGuide(persona: PersonaDials, stats: TextStats, sampleCount = 0): string {
  return [personaGuideText(persona), describeStats(stats, sampleCount)].join(" ");
}

/** Case/whitespace-insensitive comparison key for matching a voice by its
 * display name, used only to find an existing voice to accumulate onto or
 * overwrite: never used to derive an id. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Only ids this store itself minted (via randomUUID) are ever written
 * back out as a filename, but a caller-supplied id (targetId, updateVoice,
 * loadVoice, deleteVoice) reaches the filesystem too, so it's validated
 * rather than trusted, to rule out path traversal. */
function voicePath(id: string): string | undefined {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return undefined;
  return join(VOICES_DIR, `${id}.json`);
}

async function findVoiceByName(name: string): Promise<VoiceProfile | undefined> {
  const target = normalizeName(name);
  const all = await listVoices();
  return all.find((v) => normalizeName(v.name) === target);
}

/** Voices are filed on disk under their UUID, never their shortId, so a
 * shortId (the identifier tools actually show a user) can't be resolved by
 * path alone. Falls back to scanning listVoices() for a match, case-
 * insensitive since a person retyping a shortId may not preserve case. */
async function findVoiceByShortId(shortId: string): Promise<VoiceProfile | undefined> {
  const target = shortId.trim().toUpperCase();
  const all = await listVoices();
  return all.find((v) => v.shortId === target);
}

/** Mints a shortId with no collision among this store's existing voices.
 * The alphabet is wide enough (31^5) that a retry is only ever a
 * theoretical safeguard, not something expected to fire in practice. */
async function uniqueShortId(): Promise<string> {
  const existing = new Set((await listVoices()).map((v) => v.shortId));
  let candidate = generateShortId();
  while (existing.has(candidate)) candidate = generateShortId();
  return candidate;
}

async function trainVoice(rawName: string, samples: string[], targetId?: string): Promise<VoiceProfile> {
  ensureDirs();
  const name = sanitizeFreeformText(rawName);
  if (samples.length === 0) throw new Error("At least one writing sample is required to train a voice.");
  const trimmedSamples = samples.filter((s) => s.trim().length > 0);
  if (trimmedSamples.length === 0) throw new Error("Samples were empty after trimming.");
  const perSample = trimmedSamples.map(computeTextStats);
  let existing: VoiceProfile | undefined;
  if (targetId) {
    existing = await loadVoice(targetId);
    if (!existing) {
      throw new Error(`No trained voice named "${targetId}" to train further.`);
    }
  } else {
    existing = await findVoiceByName(name);
  }
  const id = existing?.id ?? randomUUID();
  const shortId = existing?.shortId ?? (await uniqueShortId());
  // A voice already carrying measured stats folds its own aggregate in as
  // one more weighted unit, so training accumulates instead of the new
  // batch simply overwriting whatever was measured before.
  const stats = mergeStats(existing && existing.sampleCount > 0 ? [existing.stats, ...perSample] : perSample);
  // Retraining from samples only touches the mechanical stats. Persona
  // dials set previously (via createFromDials, or a prior inference here)
  // survive. Only a voice that's never had a persona at all gets one
  // inferred from what it was just trained on, rather than sitting at the
  // flat 5/5/5 default forever.
  const persona: PersonaDials =
    existing?.formality !== undefined && existing?.warmth !== undefined && existing?.directness !== undefined
      ? { formality: existing.formality, warmth: existing.warmth, directness: existing.directness }
      : inferPersonaDials(stats);
  const now = new Date().toISOString();
  const newFingerprints: SampleFingerprint[] = trimmedSamples.map((text, i) => ({
    trainedAt: now,
    opener: extractOpener(text),
    topBigrams: perSample[i].topBigrams,
  }));
  const history = [...(existing?.history ?? []), ...newFingerprints].slice(-MAX_HISTORY);
  const sampleCount = (existing?.sampleCount ?? 0) + perSample.length;
  const profile: VoiceProfile = {
    id,
    shortId,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sampleCount,
    stats,
    guide: composeGuide(persona, stats, sampleCount),
    formality: persona.formality,
    warmth: persona.warmth,
    directness: persona.directness,
    history,
  };
  writeFileSync(join(VOICES_DIR, `${id}.json`), JSON.stringify(profile, null, 2), "utf8");
  return profile;
}

async function createFromDials(rawName: string, dials: StyleDials): Promise<VoiceProfile> {
  ensureDirs();
  const name = sanitizeFreeformText(rawName);
  const stats = dialsToStats(dials);
  const existing = await findVoiceByName(name);
  const id = existing?.id ?? randomUUID();
  const shortId = existing?.shortId ?? (await uniqueShortId());
  const now = new Date().toISOString();
  const profile: VoiceProfile = {
    id,
    shortId,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sampleCount: 0,
    stats,
    guide: composeGuide({ formality: dials.formality, warmth: dials.warmth, directness: dials.directness }, stats),
    formality: dials.formality,
    warmth: dials.warmth,
    directness: dials.directness,
  };
  writeFileSync(join(VOICES_DIR, `${id}.json`), JSON.stringify(profile, null, 2), "utf8");
  return profile;
}

async function forkFromPreset(preset: Preset, rawName: string): Promise<VoiceProfile> {
  ensureDirs();
  const name = sanitizeFreeformText(rawName);
  const stats = dialsToStats({ ...DEFAULT_MECHANICAL_DIALS, entropy: preset.entropy });
  const existing = await findVoiceByName(name);
  const id = existing?.id ?? randomUUID();
  const shortId = existing?.shortId ?? (await uniqueShortId());
  const now = new Date().toISOString();
  const profile: VoiceProfile = {
    id,
    shortId,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sampleCount: 0,
    stats,
    guide: presetGuideText(preset),
    formality: preset.formality,
    warmth: preset.warmth,
    directness: preset.directness,
  };
  writeFileSync(join(VOICES_DIR, `${id}.json`), JSON.stringify(profile, null, 2), "utf8");
  return profile;
}

async function forkFromGuide(seed: StyleSeed, rawName: string): Promise<VoiceProfile> {
  ensureDirs();
  const name = sanitizeFreeformText(rawName);
  const stats = dialsToStats(DEFAULT_MECHANICAL_DIALS);
  const existing = await findVoiceByName(name);
  const id = existing?.id ?? randomUUID();
  const shortId = existing?.shortId ?? (await uniqueShortId());
  const now = new Date().toISOString();
  const profile: VoiceProfile = {
    id,
    shortId,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sampleCount: 0,
    stats,
    guide: seed.guide,
    formality: seed.formality,
    warmth: seed.warmth,
    directness: seed.directness,
  };
  writeFileSync(join(VOICES_DIR, `${id}.json`), JSON.stringify(profile, null, 2), "utf8");
  return profile;
}

async function updateVoice(id: string, rawName: string, dials: StyleDials): Promise<VoiceProfile> {
  ensureDirs();
  const name = sanitizeFreeformText(rawName);
  const existing = await loadVoice(id);
  if (!existing) throw new Error(`No trained voice named "${id}".`);
  // Persona dials always apply; the mechanical stats only change for a
  // voice with no samples (a sample-trained voice keeps its measured
  // rhythm). The guide is always recomposed from whichever stats apply, so
  // an edited persona shows up in the drafting instructions right away.
  const stats = existing.sampleCount > 0 ? existing.stats : dialsToStats(dials);
  const persona: PersonaDials = { formality: dials.formality, warmth: dials.warmth, directness: dials.directness };
  const profile: VoiceProfile = {
    ...existing,
    name,
    updatedAt: new Date().toISOString(),
    stats,
    guide: composeGuide(persona, stats, existing.sampleCount),
    formality: persona.formality,
    warmth: persona.warmth,
    directness: persona.directness,
  };
  writeFileSync(join(VOICES_DIR, `${existing.id}.json`), JSON.stringify(profile, null, 2), "utf8");
  return profile;
}

async function loadVoice(id: string): Promise<VoiceProfile | undefined> {
  ensureDirs();
  const path = voicePath(id);
  if (path && existsSync(path)) {
    const profile = JSON.parse(readFileSync(path, "utf8")) as VoiceProfile;
    // Backfills a shortId for a voice written before shortId existed, once,
    // the first time it's loaded, so old libraries self-heal without a
    // separate migration step.
    if (!profile.shortId) {
      profile.shortId = await uniqueShortId();
      writeFileSync(path, JSON.stringify(profile, null, 2), "utf8");
    }
    return profile;
  }
  // Not a UUID this store recognizes as a filename: try it as a shortId,
  // the identifier every tool result actually shows a user in place of the
  // raw UUID, so it needs to work as a real lookup key, not just a display
  // string.
  return findVoiceByShortId(id);
}

async function listVoices(): Promise<VoiceProfile[]> {
  ensureDirs();
  const files = readdirSync(VOICES_DIR).filter((f) => f.endsWith(".json"));
  const profiles = files.map((f) => ({
    file: f,
    profile: JSON.parse(readFileSync(join(VOICES_DIR, f), "utf8")) as VoiceProfile,
  }));
  // Backfills a shortId for any voice written before shortId existed, so
  // old libraries self-heal without a separate migration step.
  const taken = new Set(profiles.map((p) => p.profile.shortId).filter(Boolean));
  for (const { file, profile } of profiles) {
    if (profile.shortId) continue;
    let candidate = generateShortId();
    while (taken.has(candidate)) candidate = generateShortId();
    taken.add(candidate);
    profile.shortId = candidate;
    writeFileSync(join(VOICES_DIR, file), JSON.stringify(profile, null, 2), "utf8");
  }
  return profiles.map((p) => p.profile).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function deleteVoice(id: string): Promise<boolean> {
  ensureDirs();
  const voice = await loadVoice(id);
  if (!voice) return false;
  const path = voicePath(voice.id);
  if (!path || !existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

function readConfig(): Config {
  ensureDirs();
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
  } catch {
    return {};
  }
}

function writeConfig(config: Config): void {
  ensureDirs();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

async function getDefaultStyleId(): Promise<string | undefined> {
  return readConfig().defaultStyleId;
}

async function setDefaultStyleId(id: string): Promise<void> {
  writeConfig({ ...readConfig(), defaultStyleId: id });
}

export const fsVoiceStore: VoiceStore = {
  trainVoice,
  createFromDials,
  updateVoice,
  forkFromPreset,
  forkFromGuide,
  loadVoice,
  listVoices,
  deleteVoice,
  getDefaultStyleId,
  setDefaultStyleId,
};
