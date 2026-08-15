# Installing Étincel (etincel-nonfiction) — instructions for AI agents

This file is written for an AI coding agent (Cline, Claude Code, or similar)
installing this MCP server on a user's behalf. It assumes no prior context
beyond what's below. For a human-facing overview of what the server does,
see [README.md](README.md).

## What you're installing

A local (stdio) MCP server, `etincel-nonfiction`, exposing 19 tools for
non-fiction prose: trainable writing voices, premade tone presets, and a
deterministic anti-AI-writing-tells audit (`audit_text`). No LLM calls, no
required network access, no required API key.

**Not yet published to npm.** `npx etincel` will not resolve. Install from a
git clone and point the MCP client straight at the built `dist/server.js`,
per the steps below. Don't tell the user to run `npx etincel serve` or add
an npm-registry install — neither works yet.

## Prerequisites

- Node.js >= 18 (`node -v` to check; this project uses ES modules)
- `git`

## Installation steps

1. **Clone the repo** to a stable, permanent location (not a temp
   directory — the MCP config below will reference this exact path):

   ```bash
   git clone https://github.com/AIStoryHub/etincel.git
   cd etincel
   ```

2. **Install and build:**

   ```bash
   npm install
   npm run build
   ```

   `npm install` runs `npm run build` automatically via its `postinstall`
   script, so this usually happens once. Run `npm run build` explicitly if
   `npm install` was run with `--ignore-scripts`, or after pulling updates.
   The build compiles `src/` to `dist/` with `tsc` and copies
   `src/data/*.json` (the audit corpus) into `dist/data/` — both steps are
   required; a `dist/` directory with no `dist/data/*.json` will make every
   tool call fail or return empty results.

3. **Get the absolute path** to the built server entry point:

   ```bash
   realpath dist/server.js
   ```

   You'll need this exact absolute path in the next step. A relative path
   will not resolve once the MCP client spawns the process from its own
   working directory.

4. **Add the server to the MCP client's config.** The key name
   (`etincel-nonfiction`) can be anything the user prefers; the `command`/
   `args` shape below is what matters:

   ```json
   {
     "mcpServers": {
       "etincel-nonfiction": {
         "command": "node",
         "args": ["/absolute/path/to/etincel/dist/server.js"]
       }
     }
   }
   ```

   Where this config file lives depends on the host:
   - Claude Desktop: `claude_desktop_config.json` (platform-specific location)
   - Cline: the extension's MCP settings file
   - Claude Code: `/plugin marketplace add /path/to/etincel` then
     `/plugin install etincel-nonfiction` is the native path instead of
     hand-editing JSON (Claude Code loads the bundled skill this way too,
     which the raw MCP-config route above does not)
   - Any other MCP-enabled host: wherever it reads a `mcpServers` map

5. **Restart the MCP client** so it spawns the new server process.

6. **Verify the install** by calling the `list_styles` tool. Expect a
   response listing 12 premade presets (no trained voices yet, since none
   have been created) and no error. If that works, `audit_text` — the core
   tool most users want — is confirmed working too, since both read from
   the same `dist/data/` corpus copied in step 2.

## Configuration (optional, skip by default)

No environment variables are required. The server stores trained voices,
dictionaries, and the default-style setting locally at `~/.etincel/`,
created automatically on first use — nothing to set up.

Only if the user explicitly asks for a shared/team data directory (e.g. a
synced folder multiple machines read), add an `env` block:

```json
{
  "mcpServers": {
    "etincel-nonfiction": {
      "command": "node",
      "args": ["/absolute/path/to/etincel/dist/server.js"],
      "env": { "ETINCEL_HOME": "/absolute/path/to/shared/etincel-home" }
    }
  }
}
```

## Troubleshooting

- **"Cannot find module .../dist/server.js"** — the build step (2) didn't
  run or failed. Re-run `npm run build` and read the `tsc` output for
  errors; don't skip straight to reconfiguring the MCP client.
- **Tools appear but `list_styles`/`audit_text` return empty or error on
  data lookups** — `dist/data/*.json` is missing. `npm run build`'s `cp`
  step didn't run; re-run `npm run build` (not just `tsc` directly).
- **Server process exits immediately** — check `node -v` is >= 18; this
  package uses `"type": "module"` and modern syntax that fails silently on
  older runtimes with an unhelpful error.
- **Client shows the server as configured but tools never appear** — the
  client wasn't restarted after step 4, or the config JSON has a syntax
  error (trailing comma, wrong nesting). Re-validate the JSON.

## Alternative: hosted server (no local install)

A multi-tenant hosted version of the same tools runs at
`https://etincel.ai/api/mcp` over Streamable HTTP with per-account auth,
instead of the local stdio process this file installs. Only relevant if the
user explicitly prefers not to run anything locally; it's a different
config shape (`url` instead of `command`/`args`) and is out of scope for
this file. See [README.md](README.md#remote-hosted-multi-tenant) if asked.
