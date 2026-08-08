import presetsData from "../data/presets.json" with { type: "json" };
import { entropyGuideLine } from "./dials.js";

export interface Preset {
  id: string;
  name: string;
  summary: string;
  formality: number;
  warmth: number;
  directness: number;
  /** 0-100, same scale and meaning as the entropy mechanical dial (see
   * dials.ts): how much AI-typical structural regularity this style should
   * deliberately break. */
  entropy: number;
  sentenceRhythm: string;
  guide: string;
}

const presets = presetsData as Preset[];

export function listPresets(): Preset[] {
  return presets;
}

export function getPreset(id: string): Preset | undefined {
  return presets.find((p) => p.id === id);
}

/**
 * Source of preset data for createStylesTools(). The local (stdio) server
 * uses staticPresetSource (this file's bundled JSON); a hosted server can
 * implement this interface with a database-backed source instead, so
 * presets can be edited without a redeploy.
 */
export interface PresetSource {
  listPresets(): Promise<Preset[]>;
  getPreset(id: string): Promise<Preset | undefined>;
}

/** Assembles a preset's full drafting guide as one string of prose context. */
export function presetGuideText(preset: Preset): string {
  return [
    `Style: ${preset.name}. ${preset.summary}`,
    `Sentence rhythm: ${preset.sentenceRhythm}`,
    preset.guide,
    entropyGuideLine(preset.entropy),
  ].join(" ");
}

export const staticPresetSource: PresetSource = {
  async listPresets() {
    return presets;
  },
  async getPreset(id: string) {
    return presets.find((p) => p.id === id);
  },
};
