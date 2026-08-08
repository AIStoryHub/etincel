import {
  GLOBAL_INSTRUCTIONS_SCOPE,
  mergeInstructions,
  type InstructionsStore,
} from "../engine/instructionsStore.js";

function resolveScope(styleId?: string): string {
  const trimmed = styleId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : GLOBAL_INSTRUCTIONS_SCOPE;
}

export function createInstructionsTools(store: InstructionsStore) {
  async function setStyleInstructionsTool(instructions: string, styleId?: string) {
    return store.setInstructions(resolveScope(styleId), instructions);
  }

  async function clearStyleInstructionsTool(styleId?: string) {
    return store.setInstructions(resolveScope(styleId), "");
  }

  async function getStyleInstructionsTool(styleId?: string) {
    const scope = resolveScope(styleId);
    const own = await store.getInstructions(scope);
    if (scope === GLOBAL_INSTRUCTIONS_SCOPE) {
      return { scope, instructions: own.instructions, updatedAt: own.updatedAt };
    }
    const global = await store.getInstructions(GLOBAL_INSTRUCTIONS_SCOPE);
    return {
      scope,
      instructions: own.instructions,
      updatedAt: own.updatedAt,
      // What actually applies when drafting with this style selected: the
      // global notes plus this style's own, same order get_style_guide uses.
      effective: mergeInstructions(global.instructions, own.instructions),
    };
  }

  return { setStyleInstructionsTool, clearStyleInstructionsTool, getStyleInstructionsTool };
}
