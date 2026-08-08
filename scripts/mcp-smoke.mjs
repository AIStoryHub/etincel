import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/server.js"],
});

const client = new Client({ name: "smoke-client", version: "0.1.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name));

const result = await client.callTool({
  name: "audit_text",
  arguments: { text: "As an AI language model, I don't have access to real-time data.", register: "email" },
});
console.log("AUDIT RESULT:", result.content[0].text);

await client.close();
process.exit(0);
