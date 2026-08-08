import { createStylesTools } from "./tools/styles.js";
import { fsVoiceStore } from "./engine/voiceStore.fs.js";
import { auditTextTool } from "./tools/audit.js";
import { fsDictionaryStore } from "./engine/dictionaryStore.fs.js";

const { listStylesTool, getStyleGuideTool, trainStyleTool, setDefaultStyleTool } =
  createStylesTools(fsVoiceStore);

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  section("list_styles (presets only, before training)");
  console.log(JSON.stringify(await listStylesTool(), null, 2));

  section("get_style_guide('direct-warm')");
  console.log(JSON.stringify(await getStyleGuideTool("direct-warm"), null, 2));

  section("train_style('smoke-test-voice', samples)");
  const trained = await trainStyleTool("smoke-test-voice", [
    `I shipped the first version in March. It broke twice in the first week, and I didn't sleep much. That's the honest version. The polished version says "we launched successfully," but that's not what happened.`,
    `We tried three different approaches before the fourth one worked. I was wrong about the second one for almost a month. That's fine. That's how it goes.`,
  ]);
  console.log(JSON.stringify(trained, null, 2));

  section("set_default_style('smoke-test-voice')");
  console.log(JSON.stringify(await setDefaultStyleTool("smoke-test-voice"), null, 2));

  section("audit_text on AI-slop-shaped text");
  const slop = `In today's rapidly evolving landscape of technology, it is worth noting that many experts agree that leveraging cutting-edge solutions can unlock a myriad of opportunities. Furthermore, organizations that embrace this transformative journey will find themselves well-positioned for success. Moreover, the benefits are seamless, robust, and holistic. As an AI language model, I don't have access to real-time data, but I hope this helps!`;
  console.log(JSON.stringify(await auditTextTool(fsDictionaryStore, slop, "blog"), null, 2));

  section("audit_text on clean human-ish text");
  const clean = `I missed the deadline. Not by a little. We'd promised the client March 1st and shipped March 19th, and the extra time didn't even fix the bug we were chasing. What fixed it was Priya noticing the retry logic was silently swallowing errors, which took her about ten minutes once she actually looked.`;
  console.log(JSON.stringify(await auditTextTool(fsDictionaryStore, clean, "memo"), null, 2));

  console.log("\nSmoke test complete.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
