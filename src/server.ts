#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createStylesTools } from "./tools/styles.js";
import { fsVoiceStore } from "./engine/voiceStore.fs.js";
import { createHttpPublicStyleSource } from "./engine/httpPublicStyleSource.js";
import { auditTextTool } from "./tools/audit.js";
import { findRepoConfig, REPO_STYLE_ID } from "./engine/repoConfig.js";
import { fsDictionaryStore } from "./engine/dictionaryStore.fs.js";
import { createDictionaryTools } from "./tools/dictionary.js";
import { fsInstructionsStore } from "./engine/instructionsStore.fs.js";
import { createInstructionsTools } from "./tools/instructions.js";
import { mergeInstructions } from "./engine/instructionsStore.js";
import { dialsToStats, personaGuideText } from "./engine/dials.js";
import { describeStats } from "./engine/textStats.js";

const {
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
} = createStylesTools(fsVoiceStore, undefined, fsInstructionsStore, createHttpPublicStyleSource(), fsDictionaryStore);

const {
  addBannedWordTool,
  removeBannedWordTool,
  addCustomWordTool,
  removeCustomWordTool,
  listDictionaryTool,
} = createDictionaryTools(fsDictionaryStore);

const { setStyleInstructionsTool, clearStyleInstructionsTool, getStyleInstructionsTool } =
  createInstructionsTools(fsInstructionsStore);

const dialsSchema = {
  formality: z.number().min(0).max(10).describe("0 = plain/colloquial, 10 = elevated/formal."),
  warmth: z.number().min(0).max(10).describe("0 = detached, 10 = warm/personal."),
  directness: z.number().min(0).max(10).describe("0 = hedged/indirect, 10 = blunt/direct."),
  sentenceLength: z.number().min(0).max(100).describe("0 = short sentences, 100 = long sentences."),
  sentenceRhythmVariance: z
    .number()
    .min(0)
    .max(100)
    .describe("0 = uniform sentence length, 100 = bursty/varied."),
  paragraphVariance: z.number().min(0).max(100).describe("0 = uniform paragraph length, 100 = uneven."),
  contractionUse: z.number().min(0).max(100).describe("0 = never uses contractions, 100 = uses them freely."),
  emDashUse: z.number().min(0).max(100).describe("0 = avoids em dashes, 100 = uses them often."),
  fragmentTolerance: z
    .number()
    .min(0)
    .max(100)
    .describe("0 = full sentences only, 100 = comfortable with fragments."),
  questionUse: z
    .number()
    .min(0)
    .max(100)
    .describe("0 = never poses questions, 100 = often poses direct questions."),
  entropy: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "0 = tidy, predictable structure (consistent sentence openers, plain punctuation, clean transitions), 100 = loose, human-messy structure (varied openers, uneven punctuation, no forced parallelism). Changes shape only, never grammar or accuracy."
    ),
};

const ICONS = [
  { src: "https://etincel.ai/brand/mark-on-light.svg", mimeType: "image/svg+xml", theme: "light" as const },
  { src: "https://etincel.ai/brand/mark-on-dark.svg", mimeType: "image/svg+xml", theme: "dark" as const },
];

const server = new McpServer(
  {
    name: "etincel-nonfiction",
    title: "Étincel",
    version: "0.8.0",
    description: "Gives Claude a trained writing voice, and audits drafts for AI writing tells.",
    websiteUrl: "https://etincel.ai",
    icons: ICONS,
  },
  {
    instructions:
      "Start with list_styles to see available presets and trained voices, then get_style_guide to pull the full drafting guide for the one you want before writing. After drafting, run audit_text to catch AI writing tells; use train_style or create_style_from_dials to build a new voice from the user's own writing or explicit dial values.",
    // NOT declaring a `resources` capability here: unlike the newer SDK used
    // in web/ (@modelcontextprotocol/server), this SDK's McpServer only
    // wires up the resources/list and resources/read request handlers
    // lazily, the first time registerResource() is called. Declaring the
    // capability without ever calling registerResource() would advertise
    // support and then fail every resources/list call with "Method not
    // found", worse than not declaring it at all.
  }
);

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

/** Every tool that targets one existing style takes it as `styleId`; a
 * handful of older callers may still send the pre-unification name (`id`,
 * or `presetId` for fork_style). Both are accepted here so an existing
 * integration doesn't break, but `styleId` is the one every tool's schema
 * and description actually documents. */
function resolveStyleId(styleId: string | undefined, deprecatedAlias: string | undefined): string {
  const resolved = styleId ?? deprecatedAlias;
  if (!resolved) throw new Error("styleId is required.");
  return resolved;
}

server.registerTool(
  "list_styles",
  {
    title: "List writing styles",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "List every available style: premade emotional-tone presets, any voices the user has trained from their own samples, and (if a .etincelrc in the current repo defines one) the shared team style, id 'team'. Call this before drafting or revising non-fiction prose if the caller hasn't been told which style to use, or if the user asks what styles exist.",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await listStylesTool();
      const styles: { id: string; kind: string; name: string; summary: string }[] = [...result.styles];
      const repoConfig = findRepoConfig(process.cwd());
      if (repoConfig?.style) {
        styles.push({
          id: REPO_STYLE_ID,
          kind: "repo-style",
          name: repoConfig.style.name,
          summary: `Defined in this repo's ${repoConfig.path.split("/").pop()}, shared with the whole team.`,
        });
      }
      return json({ defaultStyleId: result.defaultStyleId, styles });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_style_guide",
  {
    title: "Get a style guide",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Fetch the full drafting guide for one style (a preset id like 'direct-warm', the id of a trained voice, or 'team' for the shared style a .etincelrc in the current repo defines, if any). Returns prose instructions to follow while drafting or revising: sentence rhythm, tone dials, and (for trained voices) the writer's own measured habits. If a .etincelrc in the current repo sets team-wide instructions, those are folded into every style's instructions, not just 'team''s. Read this before drafting; it is context for you, the drafting model, not a tool that writes prose itself.",
    inputSchema: { styleId: z.string().describe("Preset id, trained voice id, or 'team', from list_styles.") },
  },
  async ({ styleId }) => {
    try {
      const repoConfig = findRepoConfig(process.cwd());

      if (styleId === REPO_STYLE_ID) {
        if (!repoConfig?.style) {
          throw new Error(
            `No team style is defined in this repo's .etincelrc. Call list_styles to see available options, or add a "style" block to .etincelrc to define one.`
          );
        }
        const { formality, warmth, directness, entropy } = repoConfig.style.dials;
        const guide = [personaGuideText({ formality, warmth, directness }), describeStats(dialsToStats(repoConfig.style.dials), 0)].join(
          " "
        );
        const ownInstructions = await getStyleInstructionsTool(REPO_STYLE_ID);
        const instructions = mergeInstructions(repoConfig.instructions ?? "", ownInstructions.effective ?? "");
        return json({
          id: REPO_STYLE_ID,
          kind: "repo-style" as const,
          name: repoConfig.style.name,
          guide,
          dials: { formality, warmth, directness, entropy },
          instructions: instructions.length > 0 ? instructions : undefined,
        });
      }

      const result = await getStyleGuideTool(styleId);
      if (repoConfig?.instructions) {
        return json({ ...result, instructions: mergeInstructions(repoConfig.instructions, result.instructions ?? "") });
      }
      return json(result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "train_style",
  {
    title: "Train a voice from writing samples",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description:
      "Analyze one or more of the user's own writing samples (emails, posts, essays, memos: real finished text they wrote or approved) and persist a trained voice profile under that name. Measures sentence length and variance, paragraph rhythm, contraction rate, em-dash and semicolon habits, fragment use, structural entropy (sentence-opener variety and punctuation-mark variety), and recurring phrasing. Call again with the same name and new samples to add more training data to that voice; the new samples blend into its existing measurements rather than replacing them. If the voice may have been renamed since it was created, pass its id (from list_styles) instead so the right voice is targeted regardless of its current name. This never fabricates a voice from a description; it only learns from real text the user supplies.",
    inputSchema: {
      name: z.string().describe("Name for this voice, e.g. the user's name or a project name."),
      samples: z
        .array(z.string())
        .min(1)
        .describe("One or more raw text samples of the user's own writing, at least a few paragraphs each for a reliable read."),
      styleId: z
        .string()
        .optional()
        .describe(
          "Id of an existing trained voice to train further, from list_styles. Use this to precisely target a voice you want to add more samples to, especially if it's been renamed. Omitted: falls back to matching an existing voice by name (case/whitespace-insensitive), or creating a new one if none matches."
        ),
      id: z.string().optional().describe("Deprecated alias for styleId."),
    },
  },
  async ({ name, samples, styleId, id }) => {
    try {
      return json(await trainStyleTool(name, samples, styleId ?? id));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "create_style_from_dials",
  {
    title: "Create a style from dials",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Build a style profile from explicit dial values instead of writing samples: for when the user wants to hand-tune a voice (or doesn't have samples handy). 3 persona dials (formality, warmth, directness, 0-10) plus 8 mechanical dials (0-100, including entropy: how much AI-typical structural regularity to break) that map onto the same measurements train_style extracts from real text, so a dial-built style and a trained voice are the same shape. Call again with the same name to overwrite.",
    inputSchema: {
      name: z.string().describe("Name for this voice."),
      dials: z
        .object(dialsSchema)
        .describe("The 11 dial values (3 persona + 8 mechanical) that define this style's voice."),
    },
  },
  async ({ name, dials }) => {
    try {
      return json(await createStyleFromDialsTool(name, dials));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "update_style",
  {
    title: "Edit an existing custom style",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Rename a trained voice or adjust its dials in place, keeping its id (and default-style pointer) stable. Persona dials (formality, warmth, directness) always apply; the mechanical dials only take effect if the voice has no writing samples (was built from dials, not trained). A sample-trained voice keeps its measured mechanical stats regardless of what's passed here.",
    inputSchema: {
      styleId: z.string().optional().describe("Id of the trained voice to edit, from list_styles."),
      id: z.string().optional().describe("Deprecated alias for styleId."),
      name: z.string().describe("New (or unchanged) name for this voice."),
      dials: z
        .object(dialsSchema)
        .describe("The 11 dial values (3 persona + 8 mechanical) that define this style's voice."),
    },
  },
  async ({ styleId, id, name, dials }) => {
    try {
      return json(await updateStyleTool(resolveStyleId(styleId, id), name, dials));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "fork_style",
  {
    title: "Fork a preset or published community style into a trained voice",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description:
      "Copy a style into a new trained voice under the given name, seeded with its persona dials and drafting guide. Two kinds of source: a premade preset (e.g. 'pr-review', 'linkedin-post'), or another installer's style published publicly on the hosted gallery, addressed as \"handle/slug\" (e.g. \"jpleblanc/blunt-memo\", the same address shown on its public page at etincel.ai/v/handle/slug). A public-style fork also carries over its 8 mechanical dials (rhythm, sentence length, em-dash use, etc.) and any banned words, custom words, or drafting instructions the source installer set specifically for that style, never their private account-wide dictionary or instructions; a preset fork only ever has persona dials and entropy to carry, since a preset has no measured mechanics. A public-style fork makes one network call to etincel.ai to fetch it; a preset fork never leaves this install. The fork is then a normal trained voice: retrain it with train_style from real samples, or hand-tune it with update_style, without touching the original.",
    inputSchema: {
      styleId: z
        .string()
        .optional()
        .describe('Id of the preset to fork (from list_styles), or a published style\'s "handle/slug" address.'),
      presetId: z.string().optional().describe("Deprecated alias for styleId."),
      name: z.string().describe("Name for the new trained voice."),
    },
  },
  async ({ styleId, presetId, name }) => {
    try {
      return json(await forkStyleTool(resolveStyleId(styleId, presetId), name));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "delete_style",
  {
    title: "Delete a trained voice",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    description: "Permanently delete a trained voice profile by id. Does not affect premade presets.",
    inputSchema: {
      styleId: z.string().optional().describe("Id of the trained voice to delete, from list_styles."),
      id: z.string().optional().describe("Deprecated alias for styleId."),
    },
  },
  async ({ styleId, id }) => {
    try {
      return json(await deleteStyleTool(resolveStyleId(styleId, id)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "set_default_style",
  {
    title: "Set the default style",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Set which style (preset or trained voice) should be used by default for this user going forward, so it doesn't need to be re-specified every time.",
    inputSchema: {
      styleId: z
        .string()
        .optional()
        .describe("Id of the style (preset or trained voice) to set as default, from list_styles."),
      id: z.string().optional().describe("Deprecated alias for styleId."),
    },
  },
  async ({ styleId, id }) => {
    try {
      return json(await setDefaultStyleTool(resolveStyleId(styleId, id)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "check_voice_match",
  {
    title: "Check a draft's rhythm against a trained voice",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Compare a piece of drafted text's measured sentence/paragraph rhythm and mechanics against a trained or custom voice's baseline (sentence length, rhythm variance, paragraph variance, contraction rate, em-dash use, fragment use, question use, structural entropy). Use this after drafting in a voice to check whether the draft's rhythm actually landed close to it, instead of just eyeballing it. Returns a verdict ('on rhythm' / 'some drift' / 'off rhythm'), a match score, specific dials that drifted with a plain-language note for each, and a caveat you should relay alongside the verdict: this is a rhythm/mechanics measurement, not an authorship or AI-detection check, so text merely shaped like the voice (by anyone, or any tool) can come back 'on rhythm', and a genuine off-voice draft by the target writer can still come back drifted. Confidence comes back \"low\" on short input, since a handful of sentences isn't enough to read rhythm reliably; treat a low-confidence verdict as provisional. Only works against trained or custom voices (from train_style, create_style_from_dials, or fork_style), not bare presets, which have no measured baseline; fork_style a preset first if you want to check a draft against one.",
    inputSchema: {
      styleId: z
        .string()
        .optional()
        .describe("Id of the trained or custom voice to compare against, from list_styles."),
      id: z.string().optional().describe("Deprecated alias for styleId."),
      text: z.string().describe("The drafted text to check."),
    },
  },
  async ({ styleId, id, text }) => {
    try {
      return json(await checkVoiceMatchTool(resolveStyleId(styleId, id), text));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "check_self_repetition",
  {
    title: "Check a draft for habits repeated across a voice's past pieces",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Compare a piece of drafted text against a trained voice's own recent training samples for two kinds of self-repetition: opening the same way (\"you've opened this way in 4 of your last 6 pieces\"), and reusing a characteristic phrase across several of them. This is about the writer's own recurring habits, not AI-writing tells; use audit_text for those. Only meaningful for a voice trained from real samples (train_style) with at least 3 recorded samples; dial-tuned or preset-forked voices, or ones with too little history yet, come back with an empty findings list rather than an error. Only the local install tracks sample history today, so a hosted/remote connection may always report zero history. A signal to weigh, same trust-mode spirit as audit_text: never rewrite the draft on the strength of this alone.",
    inputSchema: {
      styleId: z.string().optional().describe("Id of the trained voice to compare against, from list_styles."),
      id: z.string().optional().describe("Deprecated alias for styleId."),
      text: z.string().describe("The drafted text to check."),
    },
  },
  async ({ styleId, id, text }) => {
    try {
      return json(await checkSelfRepetitionTool(resolveStyleId(styleId, id), text));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "audit_text",
  {
    title: "Audit text for AI writing tells",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Deterministically scan a piece of non-fiction text for common AI-writing tells: banned hype vocabulary, chatbot fingerprints, and structural patterns (uniform paragraph length, stacked transitions, em-dash overuse, rule-of-three compulsion, and more), plus this installer's own banned/custom word lists from add_banned_word/add_custom_word (the 'global' list, merged with a style's own list if styleId is given), plus a repo-local .etincelrc/.etincelrc.json/etincel.config.json if one exists at or above the current directory (dictionary as code, reviewable and versioned). Returns a tier (green/yellow/orange/red), a numeric score, specific findings with severity and location, and a strengths signal (specificity density, concrete-vs-abstract ratio, sentence-rhythm variation). Read strengths too, not just findings: it's the counter-signal against fixing every flagged word into flat, sterile prose. Never a silent rewrite. Use this to show the user what's flagged and why, so they stay in control of any change; only rewrite what they ask you to rewrite.",
    inputSchema: {
      text: z.string().describe("The text to audit."),
      register: z
        .enum(["email", "blog", "memo", "essay", "social", "docs", "general"])
        .optional()
        .describe("Register to calibrate strictness against. Defaults to 'general'."),
      styleId: z
        .string()
        .optional()
        .describe(
          "Style id (from list_styles) whose own banned/custom word list should merge with the installer's global list. Omit to use only the global list."
        ),
    },
  },
  async ({ text, register, styleId }) => {
    try {
      const repoConfig = findRepoConfig(process.cwd());
      const effectiveRegister = register ?? repoConfig?.register;
      const extra = repoConfig && { bannedWords: repoConfig.bannedWords, allowedWords: repoConfig.allowedWords };
      return json(await auditTextTool(fsDictionaryStore, text, effectiveRegister, styleId, extra));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "add_banned_word",
  {
    title: "Add a word to a banned-words list",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Add a term to this installer's own banned-words list, checked by audit_text alongside the built-in AI-tell corpus. Without styleId, this adds to the global list, which applies to every style. With styleId, it only applies when auditing against that specific style, merged on top of the global list. Use this when the user says something like 'add [word] to my banned words list' or 'never let me use [word] again'.",
    inputSchema: {
      word: z.string().describe("The term or short phrase to ban."),
      styleId: z
        .string()
        .optional()
        .describe("Style id to scope this ban to, from list_styles. Omit to add to the global list."),
    },
  },
  async ({ word, styleId }) => {
    try {
      return json(await addBannedWordTool(word, styleId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "remove_banned_word",
  {
    title: "Remove a word from a banned-words list",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: "Remove a term from this installer's banned-words list (global, or a specific style's list).",
    inputSchema: {
      word: z.string().describe("The term to unban."),
      styleId: z
        .string()
        .optional()
        .describe("Style id the ban was scoped to, from list_styles. Omit for the global list."),
    },
  },
  async ({ word, styleId }) => {
    try {
      return json(await removeBannedWordTool(word, styleId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "add_custom_word",
  {
    title: "Add a word to a custom (allowed) words list",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Add a term to this installer's own allowed-words list, so audit_text never flags it even if it matches the built-in corpus or a banned word: the 'corporate dictionary' case, e.g. an org's own acronyms or house terms. Without styleId, this adds to the global list. With styleId, it only applies to that specific style, merged on top of the global list. Use this when the user says something like 'add [word] to my custom words list' or 'stop flagging [word], it's one of ours'.",
    inputSchema: {
      word: z.string().describe("The term or short phrase to always allow."),
      styleId: z
        .string()
        .optional()
        .describe("Style id to scope this to, from list_styles. Omit to add to the global list."),
    },
  },
  async ({ word, styleId }) => {
    try {
      return json(await addCustomWordTool(word, styleId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "remove_custom_word",
  {
    title: "Remove a word from a custom (allowed) words list",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: "Remove a term from this installer's allowed-words list (global, or a specific style's list).",
    inputSchema: {
      word: z.string().describe("The term to remove from the allowed list."),
      styleId: z
        .string()
        .optional()
        .describe("Style id the allowance was scoped to, from list_styles. Omit for the global list."),
    },
  },
  async ({ word, styleId }) => {
    try {
      return json(await removeCustomWordTool(word, styleId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_dictionary",
  {
    title: "List a dictionary's banned and custom words",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Show the banned-words and custom (allowed) words lists for a scope: the global list (default), or a specific style's list. For a style, also returns the effective merged list (that style's words plus the global ones): what audit_text actually applies when that style is selected.",
    inputSchema: {
      styleId: z
        .string()
        .optional()
        .describe("Style id to look up, from list_styles. Omit for the global list."),
    },
  },
  async ({ styleId }) => {
    try {
      return json(await listDictionaryTool(styleId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "set_style_instructions",
  {
    title: "Set custom instructions for a style",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Save free-text drafting rules layered on top of a style's voice: required elements ('always include a CTA'), audience notes, forbidden topics, format constraints, anything that isn't about sentence rhythm or tone. Overwrites whatever was saved for this scope. Without styleId, this sets the global instructions, which apply to every style. With styleId, it only applies to that specific style, merged after the global instructions (get_style_guide returns the merged result automatically). Use this when the user says something like 'for this style, always end with a CTA' or 'remember: never mention pricing in emails'.",
    inputSchema: {
      instructions: z.string().describe("The full instructions text for this scope, replacing whatever was there."),
      styleId: z
        .string()
        .optional()
        .describe("Style id to scope this to, from list_styles. Omit to set the global instructions."),
    },
  },
  async ({ instructions, styleId }) => {
    try {
      return json(await setStyleInstructionsTool(instructions, styleId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "clear_style_instructions",
  {
    title: "Clear custom instructions for a style",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: "Remove the saved instructions for a scope (global, or a specific style), leaving it empty.",
    inputSchema: {
      styleId: z
        .string()
        .optional()
        .describe("Style id to clear, from list_styles. Omit to clear the global instructions."),
    },
  },
  async ({ styleId }) => {
    try {
      return json(await clearStyleInstructionsTool(styleId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_style_instructions",
  {
    title: "Get custom instructions for a style",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Show the saved instructions for a scope: the global instructions (default), or a specific style's own. For a style, also returns the effective merged text (global plus that style's own) that get_style_guide already folds in automatically.",
    inputSchema: {
      styleId: z
        .string()
        .optional()
        .describe("Style id to look up, from list_styles. Omit for the global instructions."),
    },
  },
  async ({ styleId }) => {
    try {
      return json(await getStyleInstructionsTool(styleId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("etincel-nonfiction MCP server failed to start:", err);
  process.exit(1);
});
