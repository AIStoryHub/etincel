import { staticPresetSource, presetGuideText, type PresetSource } from "../engine/presets.js";
import { statsToDials, DEFAULT_PERSONA_DIALS, type StyleDials } from "../engine/dials.js";
import { compareToVoice } from "../engine/matchVoice.js";
import { detectSelfRepetition } from "../engine/selfRepetition.js";
import { GLOBAL_INSTRUCTIONS_SCOPE, mergeInstructions, type InstructionsStore } from "../engine/instructionsStore.js";
import { parsePublicStyleRef, type PublicStyleSource } from "../engine/publicStyleSource.js";
import type { VoiceStore } from "../engine/voiceStore.js";

export function createStylesTools(
  store: VoiceStore,
  presetSource: PresetSource = staticPresetSource,
  instructionsStore?: InstructionsStore,
  publicStyleSource?: PublicStyleSource
) {
  /** Custom instructions layered on top of a style's voice: global notes
   * plus this style's own, same merge order as get_style_instructions. */
  async function effectiveInstructions(styleId: string): Promise<string | undefined> {
    if (!instructionsStore) return undefined;
    const [global, own] = await Promise.all([
      instructionsStore.getInstructions(GLOBAL_INSTRUCTIONS_SCOPE),
      instructionsStore.getInstructions(styleId),
    ]);
    const merged = mergeInstructions(global.instructions, own.instructions);
    return merged.length > 0 ? merged : undefined;
  }

  async function listStylesTool() {
    const [presetList, voiceList, defaultStyleId] = await Promise.all([
      presetSource.listPresets(),
      store.listVoices(),
      store.getDefaultStyleId(),
    ]);
    const presets = presetList.map((p) => ({
      id: p.id,
      kind: "preset" as const,
      name: p.name,
      summary: p.summary,
    }));
    const voices = voiceList.map((v) => ({
      id: v.id,
      shortId: v.shortId,
      kind: "trained" as const,
      name: v.name,
      summary:
        v.sampleCount > 0
          ? `Trained from ${v.sampleCount} sample(s), last updated ${v.updatedAt.slice(0, 10)}.`
          : `Custom (dial-tuned), last updated ${v.updatedAt.slice(0, 10)}.`,
    }));
    return { defaultStyleId: defaultStyleId ?? null, styles: [...presets, ...voices] };
  }

  async function getStyleGuideTool(styleId: string) {
    const preset = await presetSource.getPreset(styleId);
    if (preset) {
      return {
        id: preset.id,
        kind: "preset" as const,
        name: preset.name,
        guide: presetGuideText(preset),
        dials: {
          formality: preset.formality,
          warmth: preset.warmth,
          directness: preset.directness,
          entropy: preset.entropy,
        },
        instructions: await effectiveInstructions(preset.id),
      };
    }
    const voice = await store.loadVoice(styleId);
    if (voice) {
      return {
        id: voice.id,
        shortId: voice.shortId,
        kind: "trained" as const,
        name: voice.name,
        guide: voice.guide,
        stats: voice.stats,
        sampleCount: voice.sampleCount,
        dials: {
          formality: voice.formality ?? DEFAULT_PERSONA_DIALS.formality,
          warmth: voice.warmth ?? DEFAULT_PERSONA_DIALS.warmth,
          directness: voice.directness ?? DEFAULT_PERSONA_DIALS.directness,
          ...statsToDials(voice.stats),
        },
        instructions: await effectiveInstructions(voice.id),
      };
    }
    throw new Error(
      `No style or trained voice found for "${styleId}". Call list_styles to see available options.`
    );
  }

  async function trainStyleTool(name: string, samples: string[], id?: string) {
    const profile = await store.trainVoice(name, samples, id);
    return {
      id: profile.id,
      shortId: profile.shortId,
      name: profile.name,
      sampleCount: profile.sampleCount,
      guide: profile.guide,
    };
  }

  async function createStyleFromDialsTool(name: string, dials: StyleDials) {
    const profile = await store.createFromDials(name, dials);
    return {
      id: profile.id,
      shortId: profile.shortId,
      name: profile.name,
      guide: profile.guide,
    };
  }

  async function updateStyleTool(id: string, name: string, dials: StyleDials) {
    const profile = await store.updateVoice(id, name, dials);
    return {
      id: profile.id,
      shortId: profile.shortId,
      name: profile.name,
      guide: profile.guide,
    };
  }

  async function deleteStyleTool(id: string) {
    const deleted = await store.deleteVoice(id);
    if (!deleted) throw new Error(`No trained voice named "${id}".`);
    return { deleted: true, id };
  }

  async function setDefaultStyleTool(id: string) {
    const preset = await presetSource.getPreset(id);
    const voice = preset ? undefined : await store.loadVoice(id);
    if (!preset && !voice) {
      throw new Error(`"${id}" is not a known preset or trained voice. Call list_styles first.`);
    }
    // Store the canonical id even if the caller passed a voice's shortId,
    // so every future lookup of the default style hits the same identity
    // regardless of which form was used to set it.
    const canonicalId = preset ? preset.id : voice!.id;
    await store.setDefaultStyleId(canonicalId);
    return { defaultStyleId: canonicalId };
  }

  async function forkStyleTool(presetId: string, name: string) {
    const preset = await presetSource.getPreset(presetId);
    if (preset) {
      const profile = await store.forkFromPreset(preset, name);
      return {
        id: profile.id,
        shortId: profile.shortId,
        name: profile.name,
        guide: profile.guide,
        forkedFrom: preset.id,
      };
    }

    // Not a preset id: try it as a published community style's public
    // address ("handle/slug", e.g. "jpleblanc/blunt-memo"), if this store
    // has a way to look those up at all.
    if (publicStyleSource) {
      const ref = parsePublicStyleRef(presetId);
      const seed = ref && (await publicStyleSource.getPublicStyle(ref.handle, ref.slug));
      if (seed) {
        const profile = await store.forkFromGuide(seed, name);
        return {
          id: profile.id,
          shortId: profile.shortId,
          name: profile.name,
          guide: profile.guide,
          forkedFrom: presetId,
        };
      }
    }

    throw new Error(
      `No preset or published style found for "${presetId}". Call list_styles to see available presets, or use a published style's "handle/slug" address from its public page.`
    );
  }

  async function checkVoiceMatchTool(id: string, text: string) {
    if (!text || text.trim().length === 0) {
      throw new Error("Nothing to check, text was empty.");
    }
    const voice = await store.loadVoice(id);
    if (!voice) {
      const preset = await presetSource.getPreset(id);
      if (preset) {
        throw new Error(
          `"${id}" is a preset, not a measured voice, so there's no baseline to compare against yet. Use fork_style to turn it into a trained voice first, or check against a voice trained with train_style / create_style_from_dials.`
        );
      }
      throw new Error(`No trained or custom voice found for "${id}". Call list_styles to see available options.`);
    }
    const result = compareToVoice(text, voice.stats);
    return { id: voice.id, shortId: voice.shortId, name: voice.name, ...result };
  }

  async function checkSelfRepetitionTool(id: string, text: string) {
    if (!text || text.trim().length === 0) {
      throw new Error("Nothing to check, text was empty.");
    }
    const voice = await store.loadVoice(id);
    if (!voice) {
      const preset = await presetSource.getPreset(id);
      if (preset) {
        throw new Error(
          `"${id}" is a preset, not a trained voice, so there's no sample history to compare against. Use fork_style to turn it into a trained voice first, or check against a voice trained with train_style.`
        );
      }
      throw new Error(`No trained or custom voice found for "${id}". Call list_styles to see available options.`);
    }
    const history = voice.history ?? [];
    return {
      id: voice.id,
      shortId: voice.shortId,
      name: voice.name,
      historyCount: history.length,
      findings: detectSelfRepetition(text, history),
    };
  }

  return {
    listStylesTool,
    getStyleGuideTool,
    trainStyleTool,
    createStyleFromDialsTool,
    updateStyleTool,
    forkStyleTool,
    deleteStyleTool,
    setDefaultStyleTool,
    checkVoiceMatchTool,
    checkSelfRepetitionTool,
  };
}
