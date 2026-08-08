import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpHome = mkdtempSync(join(tmpdir(), "etincel-test-"));
process.env.ETINCEL_HOME = tmpHome;

after(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

const { fsVoiceStore } = await import("../engine/voiceStore.fs.js");
const { createStylesTools } = await import("./styles.js");

const {
  listStylesTool,
  getStyleGuideTool,
  trainStyleTool,
  createStyleFromDialsTool,
  updateStyleTool,
  forkStyleTool,
  deleteStyleTool,
  setDefaultStyleTool,
  checkVoiceMatchTool,
  checkSelfRepetitionTool,
} = createStylesTools(fsVoiceStore);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAMPLE_DIALS = {
  formality: 8,
  warmth: 2,
  directness: 9,
  sentenceLength: 80,
  sentenceRhythmVariance: 20,
  paragraphVariance: 20,
  contractionUse: 10,
  emDashUse: 0,
  fragmentTolerance: 0,
  questionUse: 0,
  entropy: 20,
};

test("listStylesTool lists presets before any voice is trained", async () => {
  const result = await listStylesTool();
  assert.equal(result.defaultStyleId, null);
  assert.ok(result.styles.some((s) => s.id === "direct-warm" && s.kind === "preset"));
});

test("getStyleGuideTool returns a preset's guide", async () => {
  const guide = await getStyleGuideTool("direct-warm");
  assert.equal(guide.kind, "preset");
  assert.match(guide.guide, /Direct & Warm/);
});

test("getStyleGuideTool throws for an unknown id", async () => {
  await assert.rejects(() => getStyleGuideTool("not-a-real-style"), /no style or trained voice/i);
});

test("trainStyleTool persists a voice that list/get pick up", async () => {
  const trained = await trainStyleTool("Styles Test Voice", [
    "This is a real writing sample used to train a voice for this test.",
  ]);
  assert.match(trained.id, UUID_RE);

  const listed = await listStylesTool();
  assert.ok(listed.styles.some((s) => s.id === trained.id && s.kind === "trained"));

  const guide = await getStyleGuideTool(trained.id);
  assert.equal(guide.kind, "trained");
});

test("trainStyleTool accepts a target id to train further after a rename", async () => {
  const created = await trainStyleTool("Rename Target", ["A first sample for the rename-target voice."]);
  await updateStyleTool(created.id, "Rename Target Renamed", SAMPLE_DIALS);

  const retrained = await trainStyleTool(
    "Rename Target Renamed",
    ["A second sample added by id after the rename."],
    created.id
  );
  assert.equal(retrained.id, created.id);
  assert.equal(retrained.sampleCount, 2);

  await assert.rejects(
    () => trainStyleTool("Whatever", ["A sample."], "not-a-real-voice"),
    /no trained voice named/i
  );
});

test("createStyleFromDialsTool persists a dial-created style that list/get pick up", async () => {
  const created = await createStyleFromDialsTool("Dial Style", SAMPLE_DIALS);
  assert.match(created.id, UUID_RE);

  const listed = await listStylesTool();
  const entry = listed.styles.find((s) => s.id === created.id);
  assert.ok(entry);
  assert.equal(entry!.kind, "trained");
  assert.match(entry!.summary, /custom \(dial-tuned\)/i);

  const guide = await getStyleGuideTool(created.id);
  assert.equal(guide.kind, "trained");
  if (guide.kind === "trained") {
    assert.equal(guide.dials.formality, 8);
    assert.equal(guide.dials.sentenceLength, 80);
  }
});

test("updateStyleTool edits a dial-created style's name and dials in place", async () => {
  const created = await createStyleFromDialsTool("Style To Edit", SAMPLE_DIALS);
  const updated = await updateStyleTool(created.id, "Style Renamed", { ...SAMPLE_DIALS, warmth: 9 });
  assert.equal(updated.id, created.id);
  assert.equal(updated.name, "Style Renamed");

  const guide = await getStyleGuideTool(created.id);
  assert.equal(guide.kind, "trained");
  if (guide.kind === "trained") {
    assert.equal(guide.name, "Style Renamed");
    assert.equal(guide.dials.warmth, 9);
  }
});

test("updateStyleTool rejects an id with no existing voice", async () => {
  await assert.rejects(() => updateStyleTool("not-a-real-voice", "New Name", SAMPLE_DIALS), /no trained voice/i);
});

test("getStyleGuideTool exposes dials for a preset (persona only, no mechanical dials)", async () => {
  const guide = await getStyleGuideTool("direct-warm");
  assert.equal(guide.kind, "preset");
  if (guide.kind === "preset") {
    assert.equal(typeof guide.dials.formality, "number");
  }
});

test("setDefaultStyleTool accepts a preset id and rejects an unknown id", async () => {
  const result = await setDefaultStyleTool("executive-brief");
  assert.equal(result.defaultStyleId, "executive-brief");
  const listed = await listStylesTool();
  assert.equal(listed.defaultStyleId, "executive-brief");

  await assert.rejects(() => setDefaultStyleTool("not-a-real-style"), /not a known preset or trained voice/i);
});

test("forkStyleTool seeds a trained voice from a preset's persona dials and guide", async () => {
  const forked = await forkStyleTool("pr-review", "My PR Voice");
  assert.match(forked.id, UUID_RE);
  assert.equal(forked.forkedFrom, "pr-review");
  assert.match(forked.guide, /PR Review/);

  const listed = await listStylesTool();
  const entry = listed.styles.find((s) => s.id === forked.id);
  assert.ok(entry);
  assert.equal(entry!.kind, "trained");

  const guide = await getStyleGuideTool(forked.id);
  assert.equal(guide.kind, "trained");
  if (guide.kind === "trained") {
    assert.equal(guide.dials.formality, 4);
    assert.equal(guide.sampleCount, 0);
  }

  // The fork is a normal trained voice from here on: retraining from real
  // samples works exactly like any other dial-created voice.
  const retrained = await trainStyleTool("My PR Voice", ["A short writing sample used to retrain the fork."]);
  assert.equal(retrained.sampleCount, 1);
});

test("forkStyleTool rejects an unknown preset id", async () => {
  await assert.rejects(() => forkStyleTool("not-a-real-preset", "Whatever"), /no preset found/i);
});

let matchVoiceId: string;

test("checkVoiceMatchTool compares drafted text against a trained voice's rhythm", async () => {
  const trained = await trainStyleTool("Match Test Voice", [
    "Short line. Another short line. Keep it brief. Real short.",
  ]);
  matchVoiceId = trained.id;
  const onVoice = await checkVoiceMatchTool(
    matchVoiceId,
    "Quick note. Sent it off. Keep it tight. Done for now."
  );
  assert.equal(onVoice.id, matchVoiceId);
  assert.equal(onVoice.verdict, "close match");

  const offVoice = await checkVoiceMatchTool(
    matchVoiceId,
    "This is a considerably longer and more elaborately constructed sentence than the ones this voice usually produces, deliberately extended well past its normal length, and it continues for quite some additional distance before finally arriving at its conclusion."
  );
  assert.notEqual(offVoice.verdict, "close match");
  assert.ok(offVoice.findings.length > 0);
});

test("checkVoiceMatchTool rejects empty text and unknown ids, and explains presets have no baseline", async () => {
  await assert.rejects(() => checkVoiceMatchTool(matchVoiceId, "   "), /empty/i);
  await assert.rejects(() => checkVoiceMatchTool("not-a-real-voice", "Some text."), /no trained or custom voice/i);
  await assert.rejects(() => checkVoiceMatchTool("direct-warm", "Some text."), /fork_style/i);
});

let repetitionVoiceId: string;

test("checkSelfRepetitionTool flags an opener reused across a voice's recent samples", async () => {
  const opener = "Quarterly numbers came in ahead of";
  let trained;
  for (const tail of ["plan, three points up.", "target this time around, again.", "budget by a fair margin."]) {
    trained = await trainStyleTool("Repetition Test Voice", [`${opener} ${tail}`]);
  }
  repetitionVoiceId = trained!.id;
  const result = await checkSelfRepetitionTool(
    repetitionVoiceId,
    `${opener} schedule, which nobody expected this quarter.`
  );
  assert.equal(result.id, repetitionVoiceId);
  assert.equal(result.historyCount, 3);
  assert.ok(result.findings.some((f) => f.kind === "opener"));
});

test("checkSelfRepetitionTool returns empty findings, not an error, for a voice with too little history", async () => {
  const trained = await trainStyleTool("Fresh Voice", ["Just one sample so far, nothing to compare against yet."]);
  const result = await checkSelfRepetitionTool(trained.id, "Some other draft entirely.");
  assert.equal(result.historyCount, 1);
  assert.deepEqual(result.findings, []);
});

test("checkSelfRepetitionTool rejects empty text and unknown ids, and explains presets have no history", async () => {
  await assert.rejects(() => checkSelfRepetitionTool(repetitionVoiceId, "   "), /empty/i);
  await assert.rejects(() => checkSelfRepetitionTool("not-a-real-voice", "Some text."), /no trained or custom voice/i);
  await assert.rejects(() => checkSelfRepetitionTool("direct-warm", "Some text."), /fork_style/i);
});

test("deleteStyleTool removes a trained voice and rejects a missing one", async () => {
  const trained = await trainStyleTool("Deletable Voice", ["A short sample for a voice we're about to delete."]);
  const deleted = await deleteStyleTool(trained.id);
  assert.deepEqual(deleted, { deleted: true, id: trained.id });

  await assert.rejects(() => deleteStyleTool(trained.id), /no trained voice named/i);
});

test("getStyleGuideTool omits instructions when no instructionsStore is wired up", async () => {
  const guide = await getStyleGuideTool("direct-warm");
  assert.equal(guide.instructions, undefined);
});

test("getStyleGuideTool merges global and style-scoped instructions when an instructionsStore is given", async () => {
  const { fsInstructionsStore } = await import("../engine/instructionsStore.fs.js");
  const { getStyleGuideTool: getStyleGuideToolWithInstructions } = createStylesTools(
    fsVoiceStore,
    undefined,
    fsInstructionsStore
  );

  await fsInstructionsStore.setInstructions("global", "Always end with a call to action.");
  await fsInstructionsStore.setInstructions("direct-warm", "Assume the reader is a technical buyer.");

  const guide = await getStyleGuideToolWithInstructions("direct-warm");
  assert.equal(guide.instructions, "Always end with a call to action.\n\nAssume the reader is a technical buyer.");

  // A style with no instructions of its own still inherits the global ones.
  const untouched = await getStyleGuideToolWithInstructions("executive-brief");
  assert.equal(untouched.instructions, "Always end with a call to action.");
});
