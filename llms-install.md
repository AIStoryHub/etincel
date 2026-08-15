# Installing Étincel

Instructions for an agent (Cline or similar) setting this up autonomously. A human installing
by hand should just use the README; this file exists for the unattended case.

## What this is

An MCP server (`etincel-nonfiction`) plus a CLI. It gives the agent a trained writing voice and
a deterministic, local audit for AI writing tells. No network calls in the audit path, no API
keys, no environment variables required.

## Install

Published on npm as `etincel`. No local build needed:

```bash
npx etincel serve
```

Add it to the MCP client's server config (adjust the config file path to whichever client is
installing this):

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

## Verify the install worked

Call the `list_styles` tool. A working install returns twelve premade presets (six emotional
tones, six use-case presets) and an empty list of trained voices. If that call fails, the
server didn't start; check that `npx etincel serve` runs cleanly from a terminal first, since
that isolates an MCP-client-config problem from an actual server problem.

A second check: call `audit_text` with a short paragraph of any text. It should return a tier
(`green` through `red`), a score, and a findings array, not an error.

## Local clone instead of npm

Only needed for development, not for installing the published package:

```bash
git clone https://github.com/AIStoryHub/etincel.git
cd etincel
npm install && npm run build
```

Then point the client's `command` at `node` and `args` at
`["/absolute/path/to/etincel/dist/server.js"]`.

## Common install mistakes

- Pointing `args` at `src/server.ts` instead of the built `dist/server.js`, or instead of the
  `npx etincel serve` form. The server must run compiled JS, not the TypeScript source.
- Assuming an API key is required. None is. If a setup flow is asking for one, something has
  gone wrong upstream in that flow, not in this server.
