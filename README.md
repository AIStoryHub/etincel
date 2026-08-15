# Étincel: Non-Fiction Writing Connector

```
      ___           ___                       ___           ___           ___           ___
     /\  \         /\  \          ___        /\__\         /\  \         /\  \         /\__\
    /::\  \        \:\  \        /\  \      /::|  |       /::\  \       /::\  \       /:/  /
   /:/\:\  \        \:\  \       \:\  \    /:|:|  |      /:/\:\  \     /:/\:\  \     /:/  /
  /::\~\:\  \       /::\  \      /::\__\  /:/|:|  |__   /:/  \:\  \   /::\~\:\  \   /:/  /
 /:/\:\ \:\__\     /:/\:\__\  __/:/\/__/ /:/ |:| /\__\ /:/__/ \:\__\ /:/\:\ \:\__\ /:/__/
 \:\~\:\ \/__/    /:/  \/__/ /\/:/  /    \/__|:|/:/  / \:\  \  \/__/ \:\~\:\ \/__/ \:\  \
  \:\ \:\__\     /:/  /      \::/__/         |:/:/  /   \:\  \        \:\ \:\__\    \:\  \
   \:\ \/__/     \/__/        \:\__\         |::/  /     \:\  \        \:\ \/__/     \:\  \
    \:\__\                     \/__/         /:/  /       \:\__\        \:\__\        \:\__\
     \/__/                                   \/__/         \/__/         \/__/         \/__/
```

[![smithery badge](https://smithery.ai/badge/jp-leblanc/etincel)](https://smithery.ai/servers/jp-leblanc/etincel)

Find the AI tells in your prose. Deterministically, locally, in CI.

```
npx etincel lint README.md
```

No install, no account, no model call, no network.

```
$ npx etincel lint drafts/announcement.md --register blog
✗ drafts/announcement.md  RED 82/100  (9 findings)
    - leverage
    - streamline
    - comprehensive

1 file audited, 1 at or above orange.
```

Étincel is two things. A **deterministic audit** that finds the patterns making prose read as machine-written, as a CLI, a GitHub Action, and an MCP tool. And a **voice layer** that trains Claude, Cursor, or any MCP client to draft in a style measured from your own writing, so the problem is smaller before you ever read the draft.

AI-drafted prose has a recognizable shape: uniform paragraphs, hedged authority, em dashes where a comma would do, closings that resolve too neatly. Étincel encodes the rules against that shape and, just as important, shows you what it found and why instead of quietly overwriting your voice. There is no model call anywhere in the audit path, and you decide what changes. You stay the author.

## Does it work?

We measure it rather than assert it. Pooled AUC per register, measured by [assay](https://github.com/AIStoryHub/assay) against labeled corpora with a fixed bootstrap seed, so any PR that drops these numbers fails CI:

| Register | AUC |
|---|---|
| memo | 0.909 |
| essay | 0.900 |
| blog | 0.820 |
| general | 0.748 |
| docs | 0.735 |
| email | 0.540 |

Email is close to a coin flip. It's deliberately uncalibrated, and we track it anyway so an accidental regression doesn't go unnoticed. `general` is uncalibrated too. The calibrated registers are `docs`, `blog`, `memo`, and `essay`; use those if the number matters to you. See [`efficacy-baselines.json`](./efficacy-baselines.json) and [`src/data/SOURCES.md`](./src/data/SOURCES.md) for method and provenance.

## How this compares

**vs. [Vale](https://vale.sh) + [vale-ai-tells](https://github.com/tbhb/vale-ai-tells)**
Vale is an excellent markup-aware linter and vale-ai-tells is a serious 78-rule package. They match tokens against patterns. Étincel measures shape: sentence-rhythm variance, paragraph-length uniformity, and repetition against your own previous drafts, the kind of statistical layer vale-ai-tells' own README says needs analysis beyond what token matching can do. Étincel also feeds a trained voice to the model before you draft, which no linter does. Running both is reasonable; they overlap less than you'd expect.

**vs. skill files (stop-slop, avoid-ai-writing, no-slop)**
Those are instructions to a model, and they help. But a prompt can't verify it worked, can't produce an exit code, and can't gate a merge. Use one *and* run this in CI.

**vs. humanizers (Undetectable.ai, QuillBot, StealthWriter)**
Those rewrite your text to evade detectors. Turnitin now has a dedicated AI-paraphrasing detection feature, expanded in 2025 to target humanizer output specifically. Étincel does the opposite job: it never modifies your text, and it would be a poor tool for fooling anyone.

**vs. detectors (GPTZero, Pangram, Originality.ai, Copyleaks)**
Those answer "was a machine involved?" with a probability, over a whole document, as a verdict on authorship, in the cloud. Étincel answers "which specific patterns make this read as machine-written?" with locations and severities, locally, and never renders a verdict on who wrote something.

## Install

Also listed on the [official MCP registry](https://registry.modelcontextprotocol.io/?search=ai.etincel) as `ai.etincel/etincel-nonfiction`, so MCP-aware clients that auto-discover servers from there (VS Code's `@mcp` gallery, for one) find it without any of the config below.

### Claude Code

```
/plugin marketplace add AIStoryHub/etincel
/plugin install etincel-nonfiction
```

Or from a local clone: `/plugin marketplace add /path/to/etincel`.

### Claude Desktop / other MCP hosts

```json
{
  "mcpServers": {
    "etincel-nonfiction": {
      "command": "npx",
      "args": ["etincel", "serve"]
    }
  }
}
```

From a local clone instead: `npm install && npm run build`, then point `args` at `["/path/to/etincel/dist/server.js"]` with `"command": "node"`.

### Remote (hosted, multi-tenant)

A hosted version is also available at [etincel.ai](https://etincel.ai), exposing
the same tools over Streamable HTTP (`https://etincel.ai/api/mcp`) with
per-account auth instead of stdio. Point any MCP client at it directly:

```json
{
  "mcpServers": {
    "etincel-nonfiction": {
      "url": "https://etincel.ai/api/mcp"
    }
  }
}
```

The hosted server isn't part of this repo; this repo is the local/stdio
engine, CLI, and skill that the hosted version is built on top of.

## Using it

Once installed, just ask for what you'd normally ask for, like "draft an email to the team about the delay," "write a blog post about X," or "clean up this memo," inside Claude Code or Claude Desktop. The skill picks up automatically for non-fiction prose of meaningful length. To train your own voice:

> Train a style called "me" from these three emails I wrote: [paste samples]

Then either name it per-request ("write this in my voice") or set it as default:

> Set my default style to "me"

## Style presets

Twelve premade presets ship out of the box: six emotional tones (Direct & Warm, Executive Brief, Reflective Essayist, Founder Memo, Plainspoken Analyst, Wry & Candid) plus six use-case presets (PR Review, Code Comment, Slack Message, LinkedIn Post, Website Copy, Blog Post). Each carries formality/warmth/directness dials plus a sentence-rhythm and voice description that gets fed to the model as drafting context, not a template that fills in blanks. The server reads these from `src/data/presets.json`. Fork any preset into a trained voice with `fork_style` to make it your own.

## Command-line lint

`audit_text` is a pure function under the hood, so it also ships as a CLI, for linting prose outside a chat client (READMEs, docs, PR descriptions in CI):

```
npx etincel lint 'docs/**/*.md'
npx etincel lint README.md --register docs --threshold yellow
```

Exits non-zero if any matched file's tier is at or above `--threshold` (default `orange`). `.md`/`.mdx` files default to the `docs` register automatically (suppresses the Markdown-structure false positives, since a real heading isn't a chatbot tell); pass `--register` to override. Add `--json` for a machine-readable report. Run `npx etincel lint --help` for the full option list.

A GitHub Action wraps the same CLI (see `action.yml`, and `.github/workflows/lint.yml` in this repo for a working example):

```yaml
- uses: AIStoryHub/etincel@main
  with:
    patterns: "docs/**/*.md README.md"
    threshold: orange
```

### Repo-local config: dictionary, instructions, and a shared team style

A team's rules don't have to live only in each person's local `~/.etincel/`. Drop a `.etincelrc` (or `.etincelrc.json` / `etincel.config.json`) at the repo root and it's picked up automatically by the CLI and by the local (stdio) server, reviewable in code review and versioned instead of invisible and gone when someone leaves:

```json
{
  "bannedWords": ["Acme Cloud Platform"],
  "allowedWords": ["leverage"],
  "register": "docs",
  "threshold": "orange",
  "instructions": "Always include a one-line CTA at the end.",
  "style": {
    "name": "House Voice",
    "dials": {
      "formality": 6,
      "warmth": 4,
      "directness": 7,
      "sentenceLength": 40,
      "sentenceRhythmVariance": 50,
      "paragraphVariance": 30,
      "contractionUse": 20,
      "emDashUse": 0,
      "fragmentTolerance": 10,
      "questionUse": 5,
      "entropy": 60
    }
  }
}
```

- `bannedWords` / `allowedWords` merge alongside whatever's in your account/style dictionary; `register`/`threshold` act as repo-wide defaults that an explicit `--register`/`--threshold` flag still overrides.
- `instructions` is free text, folded into `get_style_guide`'s `instructions` for *every* style, not just the team one, ahead of your own account-level global instructions: the team-wide equivalent of `set_style_instructions` with no `styleId`, but committed to the repo instead of living in one person's account.
- `style` defines a shared "house voice" from dials, addressable everywhere as `styleId: "team"` (`get_style_guide`, and once forked into a real trained voice with `fork_style`, everywhere else too) so a team has one already-tuned starting voice from day one instead of everyone hand-training or hand-tuning their own from scratch. `list_styles` includes it automatically when a `.etincelrc` in the current repo defines one.

The hosted server doesn't use any of this (it has no local repo to look in).

### Sharing config across a team without committing it

`.etincelrc` is the versioned, code-reviewable layer above; the layer beneath it is `ETINCEL_HOME`, an environment variable that points the local (stdio) server and CLI at a directory to use instead of the default `~/.etincel/`. Point every teammate's `ETINCEL_HOME` at the same shared, synced, or mounted directory (a repo-external path everyone's machine can read, e.g. something synced by your usual file-sharing setup) and trained voices, the default style, and account-level instructions/dictionaries are shared too, not just the `.etincelrc`-committed subset:

```json
{
  "mcpServers": {
    "etincel-nonfiction": {
      "command": "node",
      "args": ["/path/to/etincel/dist/server.js"],
      "env": { "ETINCEL_HOME": "/path/to/shared/etincel-home" }
    }
  }
}
```

Nothing else to export or import: pointing `ETINCEL_HOME` at the same directory *is* the sync, the same way it already is for a single person's `~/.etincel/`.

## What's in here

- **An MCP server** (`src/server.ts`) exposing twenty tools:
  - `list_styles`: premade tone presets, any voices you've trained, and (if a repo-local `.etincelrc` defines one) a shared team style
  - `get_style_guide`: the drafting instructions for one style
  - `train_style`: learn a voice from your own writing samples (sentence rhythm, contraction rate, em-dash habits, paragraph variance, recurring phrasing: measured, not guessed)
  - `create_style_from_dials`: build a style from explicit formality/warmth/directness and mechanical dials instead of samples
  - `update_style`: rename a trained voice or adjust its dials in place
  - `fork_style`: copy a preset's dials and guide into a new trained voice you can retrain or hand-tune, or fork another installer's style once they've published it publicly on the hosted gallery (addressed as `handle/slug`, e.g. `jpleblanc/blunt-memo`, the same address shown on its public page at `etincel.ai/v/handle/slug`); a public-style fork also carries over its mechanical dials and any dictionary/instructions the source installer set specifically for that style (never their private, account-wide ones), and makes one network call to `etincel.ai` to fetch it, while a preset fork never leaves this install
  - `delete_style`: permanently remove a trained voice
  - `set_default_style`: remember which style to use without repeating yourself
  - `check_voice_match`: compare a draft's measured rhythm against a trained voice's baseline. A rhythm/mechanics check, not an authorship or AI-detection check, and low-confidence on short input
  - `check_self_repetition`: compare a draft against a voice's own recent training samples for habits, not AI tells: the same opener, or a phrase, recurring across several past pieces ("you've opened this way in 4 of your last 6 pieces"). Local install only for now
  - `audit_text`: a deterministic, rules-based scan for AI tells, returning a tier, specific findings with severity, and a strengths signal (specificity, concrete-vs-abstract ratio, sentence-rhythm variation) so fixes don't flatten the prose. Takes an optional `register` (`email` / `blog` / `memo` / `essay` / `social` / `docs` / `general` / `personal`, default `general`) to calibrate strictness against the kind of text it is: `docs` suppresses Markdown-structure false positives (headings, bolded terms) and recalibrates rhythm/vocabulary detection against long-form reference prose instead of punchier short-form copy. `personal` is scaffolded (accepted, suppresses nothing extra yet) but not yet calibrated: no term suppressions, rhythm weight, or labeled corpus of its own until one is measured. Also takes an optional `sourceFacts` (details elicited from the user, never generated): checks how many actually made it into the draft, flagging `elicited-material-unused` below a quota of two used and at least one in a sentence that isn't proving a qualification
  - `second_read`: a single model call that reads a draft and reports what a careful human editor would notice, unscored and untiered, never a rewrite. Hosted only: this install always fails with a clear explanation, since a model call needs an account, a pinned model, and a billing surface this install doesn't have. `audit_text` remains fully available, no account needed
  - `add_banned_word` / `remove_banned_word`: maintain your own banned-vocabulary list, checked by `audit_text` alongside the built-in corpus
  - `add_custom_word` / `remove_custom_word`: maintain a "never flag this" list: an org's own acronyms or house terms, the corporate-dictionary case
  - `list_dictionary`: see a scope's banned/custom words, and (for a style) what actually applies once merged with the global list
  - `set_style_instructions` / `clear_style_instructions` / `get_style_instructions`: save, remove, or read free-text drafting rules for a scope (required elements, forbidden topics, format constraints), merged into `get_style_guide` the same way dictionaries merge into `audit_text`
- **A Claude Code / Claude Desktop skill** (`skills/etincel-nonfiction/`) that uses those tools when you're drafting or revising non-fiction prose of any meaningful length.

Trained voices, dictionaries, and your default style live locally in `~/.etincel/`: nothing is sent anywhere. `audit_text` is plain deterministic code (string analysis + a curated corpus of AI-writing tells), not a model call. The one exception is forking a *public* style via `fork_style`, which fetches (never sends) that style's guide from `etincel.ai`'s public gallery; forking a preset, or anything else in this list, still touches the network not at all.

### Custom dictionaries

Beyond the built-in AI-tell corpus, you can maintain your own banned and "always allowed" word lists: just tell Claude (or any MCP client) things like "add *[word]* to my banned words list" or "add *[word]* to my custom words list, it's one of ours." Each list lives at a *scope*: `global` (applies everywhere, the default when no style is named) or a specific style id, whose list is merged on top of `global` when you audit against that style. `list_dictionary` shows what's saved for a scope, plus the effective merged list for a style. Editing the global list is already the way to keep a word in sync across every style: it's merged in automatically, live, every time `audit_text` or `list_dictionary` runs.

## Development

```
npm install
npm test        # run the engine/tools test suite (node:test via tsx)
npm run dev     # run the MCP server over stdio via tsx, for local testing
npm run build   # compile to dist/
```

[![mcpscore audit](https://mcpscore.dev/api/v1/servers/badge.svg?url=https%3A%2F%2Fetincel.ai%2Fapi%2Fmcp)](https://mcpscore.dev/s?url=https%3A%2F%2Fetincel.ai%2Fapi%2Fmcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-listed-blue)](https://registry.modelcontextprotocol.io/?search=ai.etincel)
[![CircleCI](https://dl.circleci.com/status-badge/img/circleci/HWTiYiCZoft66WSoRKovSz/c4a8237e-0e19-4b67-8934-69c2386aa42d/tree/main.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/circleci/HWTiYiCZoft66WSoRKovSz/c4a8237e-0e19-4b67-8934-69c2386aa42d/tree/main)
[![CI](https://github.com/AIStoryHub/etincel/actions/workflows/ci.yml/badge.svg)](https://github.com/AIStoryHub/etincel/actions/workflows/ci.yml)
[![Étincel lint](https://github.com/AIStoryHub/etincel/actions/workflows/lint.yml/badge.svg)](https://github.com/AIStoryHub/etincel/actions/workflows/lint.yml)
[![License: MIT](https://img.shields.io/github/license/AIStoryHub/etincel)](https://github.com/AIStoryHub/etincel/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://github.com/AIStoryHub/etincel/blob/main/package.json)
[![Last commit](https://img.shields.io/github/last-commit/AIStoryHub/etincel)](https://github.com/AIStoryHub/etincel/commits/main)

<sub><em>The mcpscore badge audits the hosted remote server (`etincel.ai/api/mcp`), not the local/stdio engine in this repo; the two expose the same tools but run as separate deployments.</em></sub>

## Status and limitations

Early, and honestly so.

- The audit corpus in `src/data/` is a curated subset, not exhaustive. See [`src/data/SOURCES.md`](./src/data/SOURCES.md) for provenance and what isn't ported yet. The full corpus is at [aistoryhub.co/corpus](https://aistoryhub.co/corpus).
- `email` (AUC 0.540) and `general` (0.748) are uncalibrated. `social` has no labeled corpus at all and isn't tracked.
- `check_voice_match` is a rhythm-and-mechanics check, not authorship detection, and it's low-confidence on short input.
- `check_self_repetition` is local-install only for now.
- AI tells are a moving target: OpenAI patched ChatGPT's em-dash habit in November 2025. That's why efficacy is measured rather than claimed: when a tell stops being a tell, the AUC moves and the regression check catches it.
