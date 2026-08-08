# Security

## Reporting a vulnerability

Please don't open a public GitHub issue for a suspected security problem. Instead, use [GitHub's private vulnerability reporting](https://github.com/AIStoryHub/etincel/security/advisories/new) for this repo, or email the maintainer listed in `package.json`. Include what you found, how to reproduce it, and the affected version.

You should get an acknowledgment within a few days. This is a small, single-maintainer project, so there's no formal SLA, but real reports get prioritized over everything else.

## Scope

- The local/stdio MCP server, CLI, and Claude Code skill in this repo.
- `action.yml`, since it runs in CI on other people's inputs.

The hosted server at `etincel.ai/api/mcp` is a separate deployment and out of scope for this repo's reports; its own account/auth surface isn't part of this codebase.

## Notes for reviewers

- `action.yml` routes all user-controlled inputs (`patterns`, `threshold`, `register`) through `env:` before they reach `bash`, specifically to avoid script injection via unsanitized template interpolation. If you're changing that file, keep it that way: don't reintroduce `${{ inputs.* }}` directly inside a `run:` block.
- Voice/style ids that reach the filesystem (`src/engine/voiceStore.fs.ts`) are validated against `^[a-zA-Z0-9-]+$` before being used to build a path, to rule out path traversal from a caller-supplied id.
- `audit_text` and the CLI lint are pure, deterministic, local computation: no network call, no model call, nothing leaves the machine.
