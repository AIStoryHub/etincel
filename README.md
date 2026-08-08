# Étincel: Non-Fiction Writing Connector

A connector for Claude Code, Claude Desktop, and any MCP-enabled tool that adds a layer of human-like non-fiction authoring on top of whatever you already write in. It does not replace your email client, editor, or CMS. It shapes the prose before it gets there, in a voice you either train from your own writing or pick from a set of premade emotional-tone presets, and it flags AI writing tells transparently instead of silently rewriting your words.

## Why

AI-drafted prose has a recognizable shape: uniform paragraphs, hedged authority, em dashes where a comma would do, case studies with no flaws, closings that resolve too neatly. That shape is what makes text feel AI-written even when it's factually fine. This connector encodes the rules that avoid that shape, and, just as important, it shows you what it found and why, instead of quietly overwriting your voice. You stay the author.

## What's in here

- **An MCP server** (`src/server.ts`) exposing seventeen tools:
  - `list_styles`: premade tone presets plus any voices you've trained
  - `get_style_guide`: the drafting instructions for one style
  - `train_style`: learn a voice from your own writing samples (sentence rhythm, contraction rate, em-dash habits, paragraph variance, recurring phrasing: measured, not guessed)
  - `create_style_from_dials`: build a style from explicit formality/warmth/directness and mechanical dials instead of samples
  - `update_style`: rename a trained voice or adjust its dials in place
  - `fork_style`: copy a preset's dials and guide into a new trained voice you can retrain or hand-tune
  - `delete_style`: permanently remove a trained voice
  - `set_default_style`: remember which style to use without repeating yourself
  - `check_voice_match`: compare a draft's measured rhythm against a trained voice's baseline
  - `check_self_repetition`: compare a draft against a voice's own recent training samples for habits, not AI tells: the same opener, or a phrase, recurring across several past pieces ("you've opened this way in 4 of your last 6 pieces"). Local install only for now
  - `audit_text`: a deterministic, rules-based scan for AI tells, returning a tier, specific findings with severity, and a strengths signal (specificity, concrete-vs-abstract ratio, sentence-rhythm variation) so fixes don't flatten the prose
  - `add_banned_word` / `remove_banned_word`: maintain your own banned-vocabulary list, checked by `audit_text` alongside the built-in corpus
  - `add_custom_word` / `remove_custom_word`: maintain a "never flag this" list: an org's own acronyms or house terms, the corporate-dictionary case
  - `list_dictionary`: see a scope's banned/custom words, and (for a style) what actually applies once merged with the global list
  - `copy_dictionary`: copy one scope's word lists onto another style, or fan them out to every known style in one call
- **A Claude Code / Claude Desktop skill** (`skills/etincel-nonfiction/`) that uses those tools when you're drafting or revising non-fiction prose of any meaningful length.

Trained voices, dictionaries, and your default style live locally in `~/.etincel/`: nothing is sent anywhere. `audit_text` is plain deterministic code (string analysis + a curated corpus of AI-writing tells), not a model call.

### Custom dictionaries

Beyond the built-in AI-tell corpus, you can maintain your own banned and "always allowed" word lists: just tell Claude (or any MCP client) things like "add *[word]* to my banned words list" or "add *[word]* to my custom words list, it's one of ours." Each list lives at a *scope*: `global` (applies everywhere, the default when no style is named) or a specific style id, whose list is merged on top of `global` when you audit against that style. `list_dictionary` shows what's saved for a scope, plus the effective merged list for a style. `copy_dictionary` copies one scope's lists onto another: pass `toScope: "all"` to push a dictionary out to every trained voice and preset in one call, the easy way to keep an org's word list in sync across styles.

## Install

### Claude Code

```
/plugin marketplace add AIStoryHub/etincel
/plugin install etincel-nonfiction
```

Or from a local clone: `/plugin marketplace add /path/to/etincel`.

### Claude Desktop / other MCP hosts

Point your MCP config at the built server:

```json
{
  "mcpServers": {
    "etincel-nonfiction": {
      "command": "node",
      "args": ["/path/to/etincel/dist/server.js"]
    }
  }
}
```

Build first: `npm install && npm run build`.

### Remote (hosted, multi-tenant)

A hosted version is also available at `https://etincel.ai/api/mcp`, exposing
the same tools over Streamable HTTP with per-account auth instead of stdio.
Point any MCP client at it directly:

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
npx etincel-nonfiction lint 'docs/**/*.md'
npx etincel-nonfiction lint README.md --register docs --threshold yellow
```

Exits non-zero if any matched file's tier is at or above `--threshold` (default `orange`). `.md`/`.mdx` files default to the `docs` register automatically (suppresses the Markdown-structure false positives, since a real heading isn't a chatbot tell); pass `--register` to override. Add `--json` for a machine-readable report. Run `npx etincel-nonfiction lint --help` for the full option list.

A GitHub Action wraps the same CLI (see `action.yml`, and `.github/workflows/lint.yml` in this repo for a working example):

```yaml
- uses: AIStoryHub/etincel@main
  with:
    patterns: "docs/**/*.md README.md"
    threshold: orange
```

### Repo-local config

A team's banned/allowed words don't have to live only in an account setting. Drop a `.etincelrc` (or `.etincelrc.json` / `etincel.config.json`) at the repo root:

```json
{
  "bannedWords": ["Acme Cloud Platform"],
  "allowedWords": ["leverage"],
  "register": "docs",
  "threshold": "orange"
}
```

Reviewable and versioned instead of invisible and gone when someone leaves. It's picked up automatically by the CLI and by the local (stdio) `audit_text` tool, merged alongside whatever's in your account/style dictionary; `register`/`threshold` act as repo-wide defaults that an explicit `--register`/`--threshold` flag still overrides. The hosted server doesn't use this (it has no local repo to look in).

## Development

```
npm install
npm test        # run the engine/tools test suite (node:test via tsx)
npm run dev     # run the MCP server over stdio via tsx, for local testing
npm run build   # compile to dist/
```

## Status

Early. The audit corpus (`src/data/`) is a curated subset, not exhaustive: see `src/data/SOURCES.md` for provenance and what's not yet ported.
