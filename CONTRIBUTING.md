# Contributing

Étincel is small and single-maintainer right now, so the bar is mostly "does it work and is it tested," not process.

## Setup

```
npm install
npm run dev     # MCP server over stdio, via tsx
npm test        # engine/tools test suite (node:test via tsx)
npm run build   # compile to dist/
```

## Before opening a PR

- `npm test` passes. New behavior in `src/engine/` or `src/tools/` needs a matching `*.test.ts`; the existing tests are the style to match (arrange a store/tool, assert observable output, no mocking beyond what the in-memory stores already give you).
- `npx tsc -p tsconfig.json --noEmit` passes. The project is `strict: true`; don't add `any` to route around it if you can help it.
- If you touched `src/data/*.json` (the audit corpus), skim `src/data/SOURCES.md` and update it if you're adding or changing provenance, not just the rule.
- If you touched `README.md`'s tool list, confirm it still matches the `server.registerTool(...)` calls in `src/server.ts`. Nothing enforces that mechanically yet.
- If you touched `orb.yml` (the CircleCI orb, mirrors `action.yml` for the GitHub Action), run it past `circleci orb validate orb.yml` ([install the CLI](https://circleci.com/docs/local-cli/) if you don't have it) before pushing.

CI runs the same checks on every PR (`tsc`, `npm test`, `npm run build`, `npm run smoke`, `npm run smoke:mcp`, plus an `orb.yml` check); it needs to be green before merge. GitHub Actions and CircleCI both run the full suite, so a PR is only mergeable once both are green.

## Reporting a security issue

See [SECURITY.md](SECURITY.md); don't open a public issue for it.

## Scope

This repo is the local/stdio engine, CLI, and Claude Code skill. The hosted multi-tenant server at `etincel.ai` is a separate deployment built on top of this code and isn't part of this repo.
