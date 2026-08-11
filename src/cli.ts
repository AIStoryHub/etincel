#!/usr/bin/env node
import { parseLintArgs, runLint, formatText, formatJson, USAGE } from "./cliLint.js";

const TOP_USAGE = [
  "Usage: etincel <command>",
  "",
  "Commands:",
  "  lint <pattern...>   Audit files for AI writing tells (npx etincel lint --help)",
  "  serve                Start the local MCP server over stdio, for Claude Desktop",
  "                        or another MCP host's config (npx etincel serve)",
].join("\n");

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(TOP_USAGE);
    process.exit(command ? 0 : 1);
  }

  if (command === "serve") {
    await import("./server.js");
    return;
  }

  if (command !== "lint") {
    console.error(`Unknown command "${command}".\n`);
    console.error(TOP_USAGE);
    process.exit(2);
  }

  const parsed = parseLintArgs(rest);
  if (parsed.kind === "help") {
    console.log(USAGE);
    process.exit(0);
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error("");
    console.error(USAGE);
    process.exit(2);
  }

  let report;
  try {
    report = runLint(parsed.options, process.cwd());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  if (report.files.length === 0) {
    console.error(`No files matched: ${parsed.options.patterns.join(", ")}`);
    process.exit(2);
  }

  console.log(parsed.options.format === "json" ? formatJson(report) : formatText(report));
  process.exit(report.failing.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
