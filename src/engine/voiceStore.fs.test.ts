import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// paths.ts reads ETINCEL_HOME at module-evaluation time, so it must be set
// before that module (or anything importing it) is loaded. A static import
// at the top of this file would resolve too early.
const tmpHome = mkdtempSync(join(tmpdir(), "etincel-test-"));
process.env.ETINCEL_HOME = tmpHome;

after(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

const { fsVoiceStore } = await import("./voiceStore.fs.js");
const {
  trainVoice,
  createFromDials,
  updateVoice,
  loadVoice,
  listVoices,
  deleteVoice,
  getDefaultStyleId,
  setDefaultStyleId,
} = fsVoiceStore;

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

test("trainVoice throws when given no samples", async () => {
  await assert.rejects(() => trainVoice("empty-voice", []), /at least one writing sample/i);
});

test("trainVoice throws when all samples are blank", async () => {
  await assert.rejects(() => trainVoice("blank-voice", ["   ", "\n"]), /empty after trimming/i);
});

test("trainVoice creates a uniquely identified, loadable profile", async () => {
  const profile = await trainVoice("My Test Voice", [
    "I shipped the fix on Tuesday. It broke again by Friday.",
  ]);
  assert.match(profile.id, UUID_RE);
  assert.equal(profile.name, "My Test Voice");
  assert.equal(profile.sampleCount, 1);

  const loaded = await loadVoice(profile.id);
  assert.ok(loaded);
  assert.equal(loaded!.name, "My Test Voice");
});

test("trainVoice infers persona dials from the samples instead of leaving them undefined (regression: trained voices used to fall back to the flat 5/5/5 default)", async () => {
  const profile = await trainVoice("inferred-persona-voice", [
    "You'll notice we've fixed this for you. We want you to feel confident using our tool. It's simple, honestly.",
  ]);
  assert.notEqual(profile.formality, undefined);
  assert.notEqual(profile.warmth, undefined);
  assert.notEqual(profile.directness, undefined);
  // Direct-address, contraction-heavy sample should read as warm, not the
  // neutral 5/5/5 midpoint every trained voice used to get.
  assert.ok(profile.warmth! > 5, `expected warmth above the flat default, got ${profile.warmth}`);
});

test("trainVoice's guide leads with persona prose, not just a mechanics readout (regression: trained-voice guides used to be weaker than a preset's)", async () => {
  const profile = await trainVoice("persona-guide-voice", [
    "You'll notice we've fixed this for you. We want you to feel confident using our tool.",
  ]);
  // The mechanics description is still in there...
  assert.match(profile.guide, /sentence/i);
  // ...but it's no longer the whole guide: persona-driven drafting prose
  // (from dials.ts's personaGuideText) comes first.
  assert.ok(
    /warm|reserved|formal|informal|point|windup/i.test(profile.guide),
    `expected persona-driven language in the guide, got: ${profile.guide}`
  );
});

test("retraining an existing voice does not overwrite a persona already set (via inference or createFromDials)", async () => {
  const first = await trainVoice("stable-persona-voice", [
    "You'll notice we've fixed this for you. We want you to feel confident using our tool.",
  ]);
  const second = await trainVoice("stable-persona-voice", [
    "The system processes requests according to a fixed schedule determined by administrators.",
  ]);
  assert.equal(second.formality, first.formality);
  assert.equal(second.warmth, first.warmth);
  assert.equal(second.directness, first.directness);
});

test("retraining an existing voice accumulates sampleCount and folds prior stats into the merge", async () => {
  const short = "Hi. Ok. Sure. Yes.";
  const long =
    "This considerably longer and more elaborately constructed sentence runs on for quite some additional distance before finally arriving at its conclusion, well past what the first sample ever did.";

  const first = await trainVoice("Accumulator", [short]);
  const second = await trainVoice("Accumulator", [long]);
  assert.equal(second.sampleCount, 2);

  // If retraining discarded the first sample's stats instead of merging
  // them in, second.stats.avgSentenceLength would equal the long sample's
  // stats alone. A real word-count-weighted merge lands strictly between
  // the two, pulled down from the long-only figure by the short sample.
  const longOnly = await trainVoice("Long Only Control", [long]);
  assert.ok(second.stats.avgSentenceLength < longOnly.stats.avgSentenceLength);
  assert.ok(second.stats.avgSentenceLength > first.stats.avgSentenceLength);
});

test("trainVoice records one history fingerprint per sample, with the sample's own opener and bigrams", async () => {
  const profile = await trainVoice("Fingerprint Voice", [
    "The retry logic broke again today. We traced the retry logic back to the same cause.",
  ]);
  assert.equal(profile.history?.length, 1);
  assert.equal(profile.history![0].opener, "the retry logic broke again today");
  assert.ok(profile.history![0].topBigrams.includes("retry logic"));
});

test("retraining a voice appends to its history instead of replacing it", async () => {
  const first = await trainVoice("History Voice", ["A first sample used to create this voice, plainly."]);
  assert.equal(first.history?.length, 1);
  const second = await trainVoice("History Voice", ["A second, unrelated sample added on a later day."]);
  assert.equal(second.history?.length, 2);
  assert.equal(second.history![0].opener, first.history![0].opener);
});

test("trainVoice caps history at the most recent MAX_HISTORY samples", async () => {
  // extractOpener only captures letters, so samples are distinguished by a
  // spelled-out marker word, not a digit.
  const markers = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
    "nineteen", "twenty", "twentyone", "twentytwo", "twentythree", "twentyfour", "twentyfive",
  ];
  let profile = await trainVoice("Capped History Voice", [`Sample marker ${markers[0]} starts this voice off.`]);
  for (let i = 1; i < markers.length; i++) {
    profile = await trainVoice("Capped History Voice", [`Sample marker ${markers[i]} adds distinct text here.`]);
  }
  assert.equal(profile.sampleCount, markers.length);
  assert.ok(profile.history!.length <= 20, `expected history capped at 20, got ${profile.history!.length}`);
  // The oldest samples should have fallen off, the most recent should remain.
  assert.ok(profile.history!.some((h) => h.opener.includes(`marker ${markers[markers.length - 1]}`)));
  assert.ok(!profile.history!.some((h) => h.opener.includes(`marker ${markers[0]}`)));
});

test("trainVoice's id is stable across a rename, decoupled from the current name", async () => {
  const created = await trainVoice("Original Name", ["A first sample used to create this voice."]);
  assert.match(created.id, UUID_RE);

  // Simulate a rename: the id stays the same; only the display name changes.
  await updateVoice(created.id, "Renamed Voice", SAMPLE_DIALS);

  const retrained = await trainVoice("Renamed Voice", ["A second sample added after the rename."], created.id);
  assert.equal(retrained.id, created.id);
  assert.equal(retrained.name, "Renamed Voice");
  assert.equal(retrained.sampleCount, 2);

  // Retraining under the stale old name, without targetId, no longer
  // matches this voice (nothing is called that anymore), so it creates a
  // new voice instead of silently reaching the renamed one.
  const underOldName = await trainVoice("Original Name", ["A sample under the stale old name."]);
  assert.notEqual(underOldName.id, created.id);
});

test("trainVoice rejects a targetId with no existing voice", async () => {
  await assert.rejects(
    () => trainVoice("Some Name", ["A sample."], "no-such-voice-id"),
    /no trained voice named "no-such-voice-id"/i
  );
});

test("listVoices returns trained voices sorted by updatedAt descending", async () => {
  const a = await trainVoice("List Voice A", ["Sample text for voice A goes here."]);
  const b = await trainVoice("List Voice B", ["Sample text for voice B goes here."]);
  const voices = await listVoices();
  const ids = voices.map((v) => v.id);
  assert.ok(ids.includes(a.id));
  assert.ok(ids.includes(b.id));
  for (let i = 1; i < voices.length; i++) {
    assert.ok(voices[i - 1].updatedAt >= voices[i].updatedAt);
  }
});

test("deleteVoice removes an existing voice and reports false for a missing one", async () => {
  const created = await trainVoice("Disposable", ["Sample text for a voice about to be deleted."]);
  assert.equal(await deleteVoice(created.id), true);
  assert.equal(await loadVoice(created.id), undefined);
  assert.equal(await deleteVoice(created.id), false);
});

test("createFromDials creates a loadable profile with sampleCount 0 and persona dials set", async () => {
  const profile = await createFromDials("Dial Voice", SAMPLE_DIALS);
  assert.match(profile.id, UUID_RE);
  assert.equal(profile.sampleCount, 0);
  assert.equal(profile.formality, 8);
  assert.equal(profile.warmth, 2);
  assert.equal(profile.directness, 9);
  assert.match(profile.guide, /sentences run long/i);
  // Persona prose (formality 8 = high band) should lead the guide, not just
  // the mechanics readout. Otherwise the dials the user just set would be
  // silently dropped from the drafting instructions.
  assert.match(profile.guide, /reads formal/i);

  const loaded = await loadVoice(profile.id);
  assert.ok(loaded);
  assert.equal(loaded!.sampleCount, 0);
});

test("createFromDials overwrites an existing dial-created voice, preserving its id and createdAt", async () => {
  const first = await createFromDials("Overwrite Me", SAMPLE_DIALS);
  const second = await createFromDials("Overwrite Me", { ...SAMPLE_DIALS, formality: 1 });
  assert.equal(second.id, first.id);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.formality, 1);
});

test("training a voice from samples preserves persona dials set previously via createFromDials", async () => {
  await createFromDials("Hybrid Voice", SAMPLE_DIALS);
  const retrained = await trainVoice("Hybrid Voice", ["A real writing sample used to retrain this voice."]);
  assert.equal(retrained.formality, 8);
  assert.equal(retrained.warmth, 2);
  assert.equal(retrained.sampleCount, 1);
});

test("updateVoice renames a dial-created voice, keeps its id, and re-derives mechanical stats", async () => {
  const created = await createFromDials("Edit Me", SAMPLE_DIALS);
  const edited = await updateVoice(created.id, "Edit Me, Renamed", { ...SAMPLE_DIALS, formality: 1, sentenceLength: 10 });
  assert.equal(edited.id, created.id);
  assert.equal(edited.name, "Edit Me, Renamed");
  assert.equal(edited.createdAt, created.createdAt);
  assert.equal(edited.formality, 1);
  assert.notEqual(edited.stats.avgSentenceLength, created.stats.avgSentenceLength);

  const reloaded = await loadVoice(created.id);
  assert.equal(reloaded?.name, "Edit Me, Renamed");
});

test("updateVoice on a sample-trained voice updates persona dials but leaves measured mechanical stats alone", async () => {
  const trained = await trainVoice("Edit Trained", [
    "A real writing sample used to train this voice for the edit test.",
  ]);
  const edited = await updateVoice(trained.id, "Edit Trained", { ...SAMPLE_DIALS, formality: 3 });
  assert.equal(edited.formality, 3);
  assert.deepEqual(edited.stats, trained.stats);
  assert.equal(edited.sampleCount, trained.sampleCount);
  // The guide is recomposed from the new persona right away, not left
  // showing the old (or no) persona until the next retrain.
  assert.match(edited.guide, /reads informal/i);
});

test("updateVoice throws for an id with no existing voice", async () => {
  await assert.rejects(() => updateVoice("no-such-voice", "New Name", SAMPLE_DIALS), /no trained voice/i);
});

test("default style id round-trips through config", async () => {
  assert.equal(await getDefaultStyleId(), undefined);
  await setDefaultStyleId("direct-warm");
  assert.equal(await getDefaultStyleId(), "direct-warm");
  await setDefaultStyleId("executive-brief");
  assert.equal(await getDefaultStyleId(), "executive-brief");
});
