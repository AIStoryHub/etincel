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
- If you touched `README.md`'s tool list, make sure it still matches the `server.registerTool(...)` calls in `src/server.ts`. Nothing enforces that mechanically yet.

CI runs the same three checks (`tsc`, `npm test`, `npm run build`) on every PR; it needs to be green before merge.

## Reporting a security issue

See [SECURITY.md](SECURITY.md); don't open a public issue for it.

## Scope

This repo is the local/stdio engine, CLI, and Claude Code skill. The hosted multi-tenant server at `etincel.ai` is a separate deployment built on top of this code and isn't part of this repo.
