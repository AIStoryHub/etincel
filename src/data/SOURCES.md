# Sources and provenance

This connector's deterministic "audit_text" rules engine is condensed and
adapted from JP LeBlanc's own existing IP, for this sibling non-fiction
connector product. Not third-party material, not a redistribution concern:
JP owns both the source skills and the source SaaS product.

## Sources

1. **`etincel-prose` skill** (`~/.claude/skills/etincel-prose/`): the
   Étincel/After-the-Prompt non-fiction drafting rules. Primary source for
   `banned-terms.json` (hard-ban tier) and `ai-tells.json` items 1-26
   (the whole-piece and sentence-level structural tell catalogue).
2. **`avoid-ai-writing` skill** (`~/.claude/skills/avoid-ai-writing/`): the
   general-purpose AI-tell detection skill, itself built from AIStoryHub's
   758-entry corpus and live scorer. Source for `soft-flag-terms.json`
   (orange/yellow tiers) and the channel/chatbot "critical" tells in
   `ai-tells.json`. Its `fiction-tells.md` reference was deliberately
   skipped: this connector is non-fiction only.
3. **`public/ai-cliches-corpus.json`** (AIStoryHub, v1.8, 758 entries): the
   canonical, versioned corpus with per-term `strength_score`,
   `confidence` (red/orange/yellow), and `lifecycle` (hard_evidence / live /
   fading / red_herring) fields. Sampled for schema and cross-checked against
   the two skills above rather than ported wholesale.
4. **`lib/corpus/structural-patterns.ts`** (AIStoryHub): regex-based
   structural detectors (contrastive negation, formulaic openers, citation
   markup leaks, etc.). Ported near-verbatim into
   `src/engine/structural-detectors.ts`, with fiction-specific patterns
   (character-intro formulas) dropped and Next.js-specific imports removed
   to make it a standalone module.
5. **`lib/tools/ai-slop-scan.ts`** (AIStoryHub, `scanText`): the
   density-based scoring algorithm (strength-weighted matches per 1000
   words, saturating toward 100, with repetition and lifecycle weighting).
   Chosen over the shorter-form `scoreAiSlop` in `lib/social/clichecheck.ts`
   because this connector handles long-form documents (chapters, essays,
   memos), not short social copy. Ported into `src/engine/score.ts`.

## Scope decisions

- **Curated subset, not the full corpus.** `banned-terms.json` and
  `soft-flag-terms.json` (340 + 123 = 463 entries as of 2026-08-10, plus
  automatic inflection matching on top, see below) are curated for
  category breadth (verbs, adjectives, nouns, filler, imagery, transitions,
  phrase subcategories) rather than mechanically dumping all 758 corpus
  rows. The full corpus can be pulled in later (e.g. as an opt-in "extended
  corpus" mode) if the curated set proves too permissive in practice.
- **2026-08-05: closed the assistant-chrome gap.** A diff against the live
  758-entry corpus (`aistoryhub-1911/public/ai-cliches-corpus.json`) found
  that `ai-tells.json`'s "assistant-chrome" tell (marked `critical`,
  "a single hit is enough to flag") had no mechanical detector; the
  corresponding loop in `score.ts` was a documentation-only no-op. Added 29
  hard-ban phrases (`sycophantic-opener` / `assistant-chrome` subcategories
  in `banned-terms.json`: "I hope this helps!", "Great question!",
  "I'm just an AI", "Regenerate response", etc.) and 6 soft-flag hedge/
  disclaimer phrases (`soft-flag-terms.json`). Also added four
  `STRUCTURAL_PATTERNS` regexes with no prior coverage: bolded-bullet terms,
  raw Markdown heading leaks, Markdown bold surviving into prose, and
  emoji-as-bullet scaffolding. Deliberately skipped "curly quotes in
  plain-text contexts" and "Would you like me to...?": the former isn't
  reliably distinguishable from correct typography without more context,
  and the latter is common, legitimate phrasing in ordinary human email.
  The broader "Words & phrases" curated-subset gap (~199 of 509 corpus
  entries, mostly marketing-hype vocabulary) is untouched: that's the
  intentional curation tradeoff above, not a bug.
- **2026-08-06: user-reported miss + business-register research pass.** A
  user cross-checking `audit_text` against external AI-tell research
  (Wikipedia's "Signs of AI writing", Reuters/Juzek & Rudnicka) found
  `elevation-echo` too narrowly tied to "not just/only": missed "None of
  this is about cutting corners. It's about cutting the waiting." Added a
  "None of this/that/it is..." branch (that opener carries the same
  elevate-and-reframe move without needing "just/only"), plus separately
  found the pattern never handled the "isn't" contraction at all ("This
  isn't just X, it's Y"); fixed both. Added `commendable`/`significant`/
  `invaluable` (3 vocabulary gaps from the same research pass).
  Also ran a dedicated research pass on business/corporate-register tells
  (a gap this connector had zero coverage of, everything skewed
  blog/essay register): added a new `business-jargon` soft-flag
  subcategory (circle back, touch base, bandwidth, cadence, operational
  excellence, etc., real business idioms with legitimate human use,
  hence soft-flag not hard-ban), ported 28 more high-strength/low-risk
  phrases from the AIStoryHub corpus gap ("it's important to note",
  "embark on a journey", "deep dive", "a myriad of", etc.), and mechanized
  `ai-tells.json`'s long-cataloged-but-never-detected "vague authority
  attribution" tell as a new structural pattern ("industry experts agree",
  "research shows", "observers note", deliberately excludes "experts
  suggest"/"experts argue", already covered as literal phrases, to avoid
  double-counting the same span). Deliberately did not mechanize
  tricolon/rule-of-three detection or bulk-add single ambiguous words
  ("employ", "tap", "uncover", "arena") from SEO listicle sources: too
  common in ordinary human writing, would flag routine prose.
- **2026-08-07: user-reported miss on marketing/positioning copy.** A user
  flagged a set of AI signals missing from the catalogue, all found in
  generated positioning copy: an "engineered category contrast" opener
  ("Most AI writing tools optimize for X. This one optimizes for Y.") too
  confident and symmetric to read as a real comparison; a core keyword
  ("voice," "write/writing") reused as a crutch in nearly every sentence;
  paragraphs each performing one cleanly-labeled marketing job (hook,
  problem, solution, CTA) rather than developing an argument; "actual"/
  "genuine" used as an authenticity-flag intensifier rather than to add a
  fact; and a tidy, quotable mission-statement close. Added five new
  `ai-tells.json` entries (`engineered-contrast-positioning`,
  `keyword-crutch-repetition`, `one-job-per-paragraph`,
  `authenticity-flag-adjective`, `manifesto-close`) and mechanized the one
  of these that reduces to a reliable regex: `category-contrast-positioning`
  in `structural-detectors.ts` catches the "Most/Many X do A. This one does
  B." shape. The other four stay catalogue-only (like
  `diagnostic-pivot-transition`): they depend on judging the whole piece's
  structure or a word's role in context, not a single span, so a regex would
  either miss most real instances or over-flag ordinary contrastive prose.
- **Names & personas** (86 corpus entries: character/place-name clichés) were
  excluded entirely: fiction-specific, out of scope for a non-fiction
  connector.
- **Two-tier model preserved.** `banned-terms.json` = hard-ban (always flag,
  `replacement_hint` where a clean one-word swap exists, mirrors the
  `lineEdits` concept from `editor-pass.md`). `soft-flag-terms.json` =
  legitimate technical/analytical uses exist; surfaced as a question via
  `note`, never auto-rewritten (mirrors `challenges`).
- **2026-08-07: entropy dial, grounded in perplexity/burstiness research.**
  Added an 8th mechanical dial (`entropy`, `src/engine/dials.ts`) covering
  "human touch," deliberate structural messiness, across every preset and
  trained voice. Grounded in AI-text-detection literature: GPTZero's public
  methodology historically split detection into perplexity (word-choice
  unpredictability: human writing runs far higher than GPT-4 output) and
  burstiness (how much per-sentence perplexity fluctuates: human ~0.6-1.2,
  GPT output clusters ~0.2-0.4); see
  [GPTZero: perplexity and burstiness](https://gptzero.me/news/perplexity-and-burstiness-what-is-it/).
  Separately, comparative human-vs-AI writing studies find AI text is more
  rigid in argumentative structure, more uniform in sentence shape, and
  more lexically repetitive, while human text is looser in structure and
  varies more; see the ScienceDirect and arXiv literature reviews cited in
  that research pass. Two of those axes (sentence-length burstiness,
  paragraph-length burstiness) were already covered by the existing
  `sentenceRhythmVariance` / `paragraphVariance` dials and by
  `structural-detectors.ts`'s `computeWholePieceMetrics()`. The entropy dial
  targets what wasn't covered: sentence-opener variety (type-token ratio of
  first words) and punctuation-repertoire variety (semicolon/colon/dash/
  parens/ellipsis use), computed as `structuralEntropy` in `textStats.ts`.
  Deliberately excludes surface errors (typos, grammar slips) even though
  human-vs-AI studies also find humans produce more of those; this is a
  professional-writing tool, not a plagiarism-evasion tool, so the dial
  changes structural shape only, never correctness. `entropyGuideLine()` in
  `dials.ts` says so explicitly at every setting.
- **2026-08-09: false-positive pass on real docs/CI usage.** Linting this
  repo's own README (and other real-world non-fiction) surfaced two
  systemic issues, not one-off misses. First, `however` and `robust` were
  hard-ban despite being ordinary, entirely legitimate words in professional
  writing; moved both from `banned-terms.json` to `soft-flag-terms.json`.
  Second, and more broadly: soft-flag corpus entries (confidence `orange`)
  were scored on a single occurrence, the same as hard-ban, even though this
  file's own `$schema_note` says they should "surface as a challenge/
  question, never auto-rewrite" and the code's own comments called them
  "context-dependent." Fixed in `score.ts`: only `red` (hard-ban) scores on
  a first hit; `orange` (soft-flag terms and most structural patterns) and
  `yellow` now both require 2+ occurrences before they count toward the
  score, matching the file's stated intent. Also added automatic inflection
  matching in `score.ts` (single-word corpus terms now also match their
  `-s/-es/-ed/-ing/-ly` forms, e.g. "framework" now also catches
  "frameworks", "robust" also catches "robustly"), since the corpus had been
  shipping inflected variants ad hoc and inconsistently (`dive`/`diving` but
  not `harness`/`harnessing`). Generated forms that collide with an existing
  explicit entry (like `diving`) are excluded to avoid double-counting.
  Separately (engine-only, no data changes): `auditText` now blanks fenced/
  inline Markdown code before scoring (code samples in a README shouldn't be
  scanned as prose), and a piece with strong specificity/groundedness
  signals now caps at `yellow` instead of climbing to orange/red on soft
  tells alone, unless a `hard_evidence` finding (an unambiguous assistant
  artifact) is present, in which case the cap never applies. Also (still
  2026-08-09): dogfooding the above against this repo's own README turned up
  two more real false positives. `neon` (an `imagery-cliche` hard-ban entry
  for "neon-lit streets" phrasing) was matching "Neon" the Postgres
  provider; `score.ts` now excludes a single-word term matched in Title Case
  mid-sentence as a likely proper noun (a product name, a person's name),
  since the actual imagery tell is almost always lowercase in real
  AI-generated prose. Ordinary sentence-initial capitalization is left
  alone. And `curate` was hard-ban despite being the precise, literal verb
  for an actual editorial selection process ("a curated corpus," "a curated
  subset," both true of this repo's own corpus); moved to soft-flag
  alongside `however`/`robust` above.
- **2026-08-10: retired four transition/filler entries that fired more on
  human prose than AI prose.** A benchmark comparing real flag rates across
  human and AI-drafted samples found `however` and `generally`
  (`soft-flag-terms.json`, `transition` category) and `sure`
  (`soft-flag-terms.json`, `filler` category) triggering more often on the
  human side, worse than a no-op signal, not just weak. Same finding for
  `furthermore` (`banned-terms.json`, hard-ban `red` confidence, so it was
  scoring on a single ordinary use, no occurrence threshold to soften it).
  All four removed outright rather than downgraded again: each entry's own
  note already conceded the ambiguity ("conversational use is real,"
  "legitimate scope-widening use") before this pass, so softening the tier
  further was already tried and wasn't enough. Corpus now 340 + 123 = 463
  entries (was 341 + 126 = 467).
- **2026-08-10: register-calibrated the mechanical/rhythm layer; pooled AUC
  0.489 (chance) → 0.725 on a labeled docs corpus.** An `assay` efficacy run
  (a sibling falsifiable-eval-harness repo, see `../assay`) against 29
  pre-2021 human docs and 50 AI docs (two effort tiers)
  found the detector indistinguishable from chance at `register: "docs"`
  (AUC 0.489, 95% CI [0.35, 0.63]) and 7 of 12 fired dictionary terms
  ("in order to", "when it comes to", "significant", "propagate", "domain",
  "expedite", "framework", "validate") firing *more* on the human class than
  the AI class, ordinary formal-register vocabulary in long-form reference
  prose, not an AI tell in that genre. Two fixes: (1) those 8 terms are now
  suppressed for `register: "docs"` via a new `REGISTER_TERM_SUPPRESSIONS`
  map in `score.ts` (structurally suppressed, not sign-flipped: the
  inversion is measured on a small corpus, so trusting its direction was
  safer than trusting its magnitude); (2) `detectWholePieceRhythm`'s
  paragraph-uniformity and sentence-burstiness checks, previously a fixed
  0.35 coefficient-of-variation cutoff for every register, are now compared
  against a per-register baseline (`REGISTER_MECHANICAL_BASELINES` in
  `structural-detectors.ts`) computed from 191 independent pre-2021 docs
  pages (kubernetes/website, rust-lang/rust, postgres, curl, vuejs/docs,
  npm/cli, deliberately different repos than assay's own held-out human
  corpus, to avoid calibrating on the same documents the AUC is measured
  against). Real docs prose, human or AI, runs CV 0.5-0.8; a 0.35 cutoff
  built for punchier short-form copy sat under where either class lives and
  almost never fired, which is why 29 of 30 structural-pattern detectors
  and both whole-piece rhythm checks were effectively dormant on this genre.
  Two new checks (fragment-rate and structural-entropy drift from the same
  baseline) were added alongside for `register: "docs"` only. Whole-piece
  rhythm findings' score weight went from 6 to 14 points each, tuned against
  the same labeled corpus (stopped short of the further-improving value of
  18-per-finding because that extra gain came from a rising false-positive
  rate, not broader separation, a sign of fitting the one small corpus
  rather than the underlying signal). None of this touches non-"docs"
  registers or the tier-55 threshold: per the same eval philosophy, a
  threshold is cheap to recalibrate once the signal is real, and pointless
  to touch while it wasn't. Caveat carried forward from the eval harness
  itself: 79 total labeled documents is small; treat 0.725 as "the two
  systemic bugs are fixed and the rhythm signal is real," not as a
  field-validated number, and re-run before trusting a further push past
  this weight.
- **2026-08-10: register-calibrated `blog`, the first of six repeats of the
  `docs` fix above; pooled AUC 0.726 (chance-adjacent, dominated by an easy
  low-effort tier) → 0.820.** Independently measured, not copied from docs:
  a labeled blog corpus (30 pre-2021 human posts from rust-lang/blog.rust-lang.org
  and electron/electronjs.org's data/blog, dual MIT/Apache-2.0 and MIT
  respectively, verified directly rather than assumed from either repo's
  overall license; 15 hand-written "careful" and 15 "low-effort" AI posts,
  fictional projects, no real product names) showed AUC 0.726 unfixed, but
  that number hid a 0.449 spread between effort tiers: AUC 0.940 on the
  low-effort class (already well-caught) and 0.511 on the careful class
  (chance), the tier that actually matters. Same two-part fix as docs, both
  measured fresh against this corpus: (1) `REGISTER_TERM_SUPPRESSIONS.blog`
  suppresses `ecosystem`, `highlight`, `manifest`, `additionally` (each with
  negativeRate > positiveRate at 4+ hits); notably NOT the same list as
  docs, "significant" is inverted for docs but fires *more* on the AI class
  here (lift 2.2, kept), confirming the same word can point opposite
  directions in two registers. (2) `REGISTER_MECHANICAL_BASELINES.blog`
  calibrated from 166 independent pre-2021 posts on the official Go blog
  (golang/website, permissive license, not overlapping either repo in the
  test corpus above): fragmentRate runs meaningfully higher than docs
  (0.115 vs 0.069) and paragraphLengthCV meaningfully lower (0.609 vs
  0.719). A third mechanism, `REGISTER_DETECTOR_SUPPRESSIONS.blog`, also
  got a fresh entry: `markdown-heading-leak` fired on 100% of the positive
  class and 86% of the negative class (lift 1.16, non-discriminating noise,
  since blog posts use `##` subheadings as legitimate structure the same
  way docs prose does): the other three docs suppressions were NOT carried
  over, `markdown-bold-in-prose` showed real separation on this corpus
  (lift 1.66) and the remaining two never cleared the 4-hit minimum either
  way. The rhythm-finding weight was swept (8/10/14/16/18/22) rather than
  assumed: FPR and recall held completely flat across 14-18 with AUC
  creeping up only 0.006 across that whole range, well inside the ~0.2-wide
  bootstrap CI, so no register-specific value was justified; 14 (docs'
  own value) is set explicitly in `REGISTER_RHYTHM_WEIGHT.blog` so the
  record shows it was measured and confirmed for blog, not silently
  inherited. Net: careful-tier AUC 0.511 → 0.692, pooled 0.726 → 0.820
  (95% CI [0.705, 0.915]). One known residual: the `low-burstiness`
  whole-piece check is itself mildly inverted post-fix (lift 0.24, 7 hits,
  fires on 21% of the human class vs 3% of AI): thin data at the trust
  floor, already netted into the reported AUC rather than hidden, and left
  unaddressed because there's no existing per-register suppression
  mechanism for an individual `detectWholePieceRhythm` finding id (only
  `getCompiledEntries()` entries support `REGISTER_DETECTOR_SUPPRESSIONS`
  today); worth a follow-up once more blog data accumulates. Corpus
  provenance and code: `assay/corpora/blog/` and `assay/corpora/build-blog-corpus.mjs`
  in the sibling `../assay` repo.
- **2026-08-10: register-calibrated `memo`, the second repeat of the docs
  fix; pooled AUC 0.793 → 0.909.** Independently measured against its own
  labeled corpus (30 pre-2021 human documents: Rust compiler-team meeting
  minutes and Go change-proposal design docs, dual MIT/Apache-2.0 and
  BSD-style respectively; 15 "careful" and 15 "low-effort" AI memos,
  fictional projects). Unfixed AUC 0.793 again hid a large tier spread:
  0.959 on low-effort (already caught), 0.628 on careful (the tier that
  matters). Same three-mechanism fix as blog, each measured fresh against
  this corpus, not copied: (1) `REGISTER_TERM_SUPPRESSIONS.memo` suppresses
  `mechanism`, `similarly`, `when it comes to` (each negativeRate >
  positiveRate at 4+ hits); `when it comes to` is also suppressed for docs,
  an independent confirmation on a different corpus rather than an
  assumption carried over. (2) `REGISTER_DETECTOR_SUPPRESSIONS.memo` adds
  `markdown-heading-leak`: it fired on literally 100% of BOTH classes here
  (lift exactly 1.0), the most non-discriminating result across three
  registers now checked, because meeting-minutes and proposal docs use `##`
  headers as structure the same way docs and blog prose do.
  `markdown-bold-in-prose` again showed real separation (lift 2.74) and was
  not suppressed. (3) `REGISTER_MECHANICAL_BASELINES.memo` calibrated from
  170 independent pre-2021 Node.js TSC meeting-minutes documents
  (calibration-only, never committed as corpus text: nodejs/TSC carries no
  explicit LICENSE, a bar too low to redistribute raw text but fine for
  aggregate statistics that never leave this comment as anything but four
  numbers): paragraphLengthCV runs sharply higher than docs (0.719) and
  blog (0.609) at 0.894, meeting-minutes agenda items vary wildly in length
  in a way neither reference docs nor blog posts do; fragmentRate runs
  lower than blog (0.115) at 0.057, closer to docs (0.069). The
  rhythm-finding weight sweep told a genuinely different story than blog's:
  where blog's FPR plateaued across 14-18, memo's FPR and AUC climbed
  together with no plateau at any point swept (6 through 22), so the
  docs/blog default of 14 was NOT the right number here. FPR held flat at
  0.4 across weights 11-13 while recall reached exactly 1.0 only at 13 (up
  from 0.967 at 11-12) and AUC kept improving across that same flat-FPR
  window (0.898 → 0.909); at 14, FPR jumped straight to 0.5 for only +0.008
  more AUC, with recall already saturated, so `REGISTER_RHYTHM_WEIGHT.memo`
  is set to 13, not 14. This is the concrete case for why each register
  needs its own sweep: two registers independently confirming the same
  default (docs, blog) did not predict the third. Net: careful-tier AUC
  0.628 → 0.857, pooled 0.793 → 0.909 (95% CI [0.833, 0.969]). Same known
  residual as blog: `low-burstiness` is mildly inverted post-fix (lift
  0.70, 10 hits, posRate 0.13 vs negRate 0.20), a milder version of the same
  issue blog showed. Already netted into the reported AUC, left unfixed for
  the same reason as blog: no per-finding-id suppression mechanism exists
  yet. Corpus provenance and code: `assay/corpora/memo/`
  and `assay/corpora/build-memo-corpus.mjs` in the sibling `../assay` repo.
- **2026-08-10: register-calibrated `essay`, the third repeat of the docs
  fix; pooled AUC 0.776 → 0.900.** Independently measured against its own
  labeled corpus (24 pre-2021 human documents: Rust RFCs and a curated set
  of Python feature PEPs, dual MIT/Apache-2.0 and public domain/CC0-1.0
  respectively; the PEPs are DIFFERENT document numbers than the four
  already used in the docs corpus, no document shared between two
  registers' corpora; 12 "careful" and 12 "low-effort" AI essays, fictional
  languages/tools). `rust-lang/blog.rust-lang.org`'s `posts/inside-rust/`
  was checked and rejected: most of its pre-cutoff posts are team-membership
  updates and meeting announcements, not genuinely argumentative essays, and
  hand-curating the few that are risked cherry-picking without a principled
  filter. Unfixed AUC 0.776 hid the same tier spread as the other two
  registers: 0.936 on low-effort, 0.616 on careful. Same three-mechanism
  fix, each measured fresh: (1) `REGISTER_TERM_SUPPRESSIONS.essay` suppresses
  `propagate`, `evaluate`, `moreover`, `similarly`, `additionally` (each
  negativeRate > positiveRate at 4+ hits); `propagate` is also suppressed
  for docs and `similarly`/`additionally` for memo/blog respectively,
  independent confirmations on unrelated corpora. `significant` is inverted
  for docs but fires MORE on the AI class here too (lift 4.63, kept), the
  same direction blog independently found, a second cross-register
  confirmation that word can't be assumed either way without measuring.
  (2) `REGISTER_DETECTOR_SUPPRESSIONS.essay` adds `markdown-heading-leak`:
  still non-discriminating here (lift 1.4), weaker than docs/blog/memo's
  near-1.0 lift but still low enough to suppress; `markdown-bold-in-prose`
  again showed real separation (lift 3.9) and was not suppressed. (3)
  `REGISTER_MECHANICAL_BASELINES.essay` calibrated from 47 independent
  pre-2021 RFC documents (reactjs/rfcs, ember-cli/rfcs, npm/rfcs combined
  for volume, since none alone had enough pre-cutoff documents; smaller
  calibration sample than docs/blog/memo's ~170-190, reported honestly
  rather than padded with a weaker source): structuralEntropy runs higher
  than docs (0.583) and blog (0.591) at 0.627, essays argue against
  alternatives and defend trade-offs, reading as more varied sentence-opener
  and punctuation structure than announcement or reference prose. The
  rhythm-weight sweep produced a third distinct shape: FPR climbed steadily
  with weight up through 14 (unlike blog, where 14 was already the
  plateau), then flattened at 0.542 across weights 18-22 while AUC kept
  improving in that flat window and recall saturated at 1.0; 22 is the last
  weight before FPR climbs again (0.625 at 24), and by 30 the same
  overfitting signature as the other two registers appears (AUC actually
  drops while FPR keeps rising). `REGISTER_RHYTHM_WEIGHT.essay` is set to
  22, not 13 or 14: essay's sweep landed somewhere between blog's "confirmed
  the shared default" and memo's "found a lower number", its own answer.
  Net: careful-tier AUC 0.616 → 0.863, pooled 0.776 → 0.900 (95% CI [0.800,
  0.982]). No residual `low-burstiness` inversion this time, unlike blog
  and memo: the fired-checks table came back clean. Corpus provenance and
  code: `assay/corpora/essay/` and `assay/corpora/build-essay-corpus.mjs`
  in the sibling `../assay` repo.
- **2026-08-10: `email` investigated and left entirely unfixed, on purpose.
  Pooled AUC stays at 0.540 (chance, 95% CI [0.44, 0.64], straddling 0.5
  throughout).** Different finding than the other four registers: this
  isn't a calibration-direction problem the two-part fix pattern solves,
  it's structural. Measured directly against the labeled test corpus (31
  human documents, mean 166 words; 15 "careful" + 15 "low-effort" AI
  documents): only 13 of 61 documents produced *any* scored finding at any
  register setting. This engine's whole-piece rhythm checks need 8+
  sentences and 4+ paragraphs to fire at all, and its soft-flag term
  scoring needs 2+ occurrences of a term within one document to count
  (`OVERUSE_THRESHOLD` in `score.ts`); most email-register documents are
  short enough that neither condition is ever met, regardless of how
  AI-typical the prose reads. No dictionary term suppression was added:
  none cleared this project's 4-document-hit trust floor in either
  direction. A `REGISTER_MECHANICAL_BASELINES.email` entry WAS built and
  tested (calibrated from 80 independent pre-2021 Enron messages,
  sentenceLengthCV 0.661/0.235, paragraphLengthCV 0.528/0.297, fragmentRate
  0.153/0.142 (the highest of any register calibrated so far), structuralEntropy
  0.532/0.124 (the lowest)) and it measurably made pooled AUC *worse*
  (0.540 → 0.497), not better: short documents produce inherently noisy
  per-document CV estimates for both classes, so a calibrated threshold
  loosens without discriminating any better. Reverted rather than kept for
  a worse number. The rhythm-finding weight was swept too (8 through 40,
  against the generic uncalibrated threshold): AUC crept up with weight
  (0.540 at 14 up to 0.567 at 40) but recall stayed flat at 0.033 across
  that entire range, meaning the gain was pure re-ranking among the same
  one or two already-differentiated documents, not broader detection
  coverage, unlike docs/blog/memo/essay's sweeps, where recall and FPR both
  visibly tracked the weight. Not the kind of signal this project trusts,
  so `REGISTER_RHYTHM_WEIGHT.email` stays unset, at the shared default of
  14, which reproduces the unfixed 0.540 exactly.
  **Net state: `email` has no term suppressions, no detector suppressions,
  no mechanical baseline, and no register-specific rhythm weight**: it
  falls through to exactly the same behavior as no register at all,
  confirmed by two regression tests (`score.test.ts`,
  `structural-detectors.test.ts`) that assert this explicitly, so a future
  edit that adds any of these back gets flagged to re-verify against this
  finding rather than silently reintroducing a change already shown not to
  help. **The real fix for email register, if one exists, is architectural,
  not a calibration problem**: lowering the sentence/paragraph-count floors
  or the soft-flag overuse threshold specifically for short-form registers,
  which is new-mechanism scope beyond "repeat the same two-part fix" and
  wasn't attempted here. Corpus sourcing is also structurally different
  from the other four registers (no git-history equivalent exists for
  "email register"): built from the Enron email corpus (CMU-hosted, public
  FERC investigative record, 1999-2002, trivially pre-LLM), hand-reviewed
  document-by-document with safeguards well beyond the legal minimum
  (subject-line pre-filtering, individual body review, four candidates
  dropped despite passing automated filters, personal phone numbers
  redacted, nested reply chains truncated to two layers). Full rationale
  and safeguards in `assay/corpora/email/SOURCES.md`.
- **2026-08-10: `social` deliberately left unattempted. `register: "social"`
  has no term suppressions, no detector suppressions, no mechanical
  baseline, and no register-specific rhythm weight, the same net state as
  `email`, but for a different reason: no corpus was built at all, not a
  built-and-measured-then-reverted fix. Checked one real candidate source
  (the public Hacker News Firebase API, `hacker-news.firebaseio.com`) before
  deciding: it's dated (Unix timestamps per item), public, and genuinely
  social-register in tone (spot-checked a real 2011 comment). The blocker
  wasn't sourcing mechanics, it was licensing precedent. Every other
  register has at least one of: a project's own explicit code/docs license
  (docs, blog, memo, essay) or, for email, an institutional public-record
  release event (FERC's Enron investigation) with two decades of
  uncontested academic reuse specifically because of that release. No
  social-media corpus has an equivalent event: HN comments (or any social
  platform's public content) are "long-standing, widely scraped for
  research, never specifically litigated at this project's stakes", a
  meaningfully shakier kind of "settled" than Enron's, and one that has
  visibly broken before elsewhere (Pushshift's Reddit dataset lost API
  access after a platform policy change, evidence this space isn't as
  stable as its scraping history suggests). Confirmed with the user
  (2026-08-10) before spending further effort: skip social rather than
  build a corpus on the shakiest legal footing of any register so far, on
  top of the same structural problem `email` already demonstrated (very
  short documents starve this engine's whole-piece rhythm checks and
  soft-flag overuse scoring regardless of register calibration) that social
  register, being shorter-form than email on average, would likely hit even
  harder. Matches this task's own anticipated outcome going in: "consider
  whether... explicitly flagging social as unfixed, with a documented
  reason, is more honest than forcing a low-confidence fix." No code
  changes, no corpus, no assay config for social exists as a result, only
  this entry, so a future attempt starts from a clear record of what was
  checked and why it stopped here.
- **2026-08-10: `general` measured, not assumed, and left unfixed for a
  third distinct reason: it has no stable-enough identity to calibrate
  against, confirmed by measurement rather than inferred going in.**
  "general" is the fallback register, not a genre with its own voice, so
  building a labeled corpus for it the way docs/blog/memo/essay were built
  (dated prose from one or two coherent sources) doesn't apply; there's no
  single population called "general register" to sample from. Instead of
  skipping straight to that conclusion, it was tested directly: a 24-document
  corpus built as a deliberate mix, 6 documents each from the already-vetted
  docs/blog/memo/essay human corpora (same 6-each split for the ai-careful
  and ai-naive tiers, 24 each), reusing already-cleared material rather than
  new sourcing. `email` was excluded from the mix on purpose (its very
  different length profile would reintroduce the exact structural confound
  diagnosed for the `email` register itself); `social` was never built so it
  isn't part of the mix either. Full rationale in
  `assay/corpora/general/SOURCES.md`.

  Unfixed pooled AUC came back at 0.757 (95% CI [0.635, 0.863]), already
  better than docs/blog/memo/essay's OWN unfixed baselines were before their
  fixes, because the mix inherits real signal each of those four registers
  had already independently established. The lift table surfaced four
  apparently-inverted terms (`framework`, `evaluate`, `benchmark`,
  `dynamic`, each clearing the 4-hit floor), which looked at first like
  fresh suppression candidates the same way they were for the other four
  registers. Checked which specific documents each hit came from before
  trusting the direction, and found the opposite of a general-register
  signal: `framework`'s hits concentrate almost entirely in the docs-sourced
  documents (12+1+1+10), the same term docs already independently suppresses
  for itself; `evaluate`'s hits concentrate almost entirely in the
  essay-sourced (PEP) documents (1+13+11+13), the same term essay already
  independently suppresses; `benchmark`'s hits concentrate almost entirely
  in the memo-sourced (Go proposal) documents (26+5+1); only `dynamic`
  showed any real spread across sub-genres, and even that was thin (5 hits
  across 3 sub-genres, 1-2 each, not clearly signal over noise). None of
  these are a "general register" phenomenon: they're one specific
  sub-genre's already-known-or-plausible vocabulary quirk bleeding through
  an arbitrary 6-per-register sample. A different sample draw would surface
  different "inverted" terms, which is itself the finding: **there is no
  stable general-register vocabulary skew to suppress, because "general"
  isn't a stable population.** Suppressing any of these would have meant
  re-encoding one sub-genre's already-independently-measured calibration
  under a misleading "general" label, exactly the mistake the "be more
  conservative about what counts as a confirmed signal" caution for this
  register (from the task this repeats) was warning against. The same
  reasoning extends to the mechanical baseline without needing to build a
  separate calibration corpus to prove it: docs/blog/memo/essay's own
  baselines are measurably different from each other (sentenceLengthCV
  0.666/0.647/0.781/0.668, to pick one), so any single "general" baseline
  would be an arbitrary blend of four different real populations, weighted
  by whatever mix ratio happened to get sampled, not a real fifth
  population of its own.

  **Net state: `general` has no term suppressions, no detector
  suppressions, no mechanical baseline, and no register-specific rhythm
  weight, the same net configuration as `email` and `social`, but reached
  by direct measurement (unlike `social`, which was never built) that
  confirmed the existing generic fallback is already the correct behavior,
  not merely the default one.** The 0.757 unfixed AUC is arguably the
  intended, correct outcome for auditing genuinely mixed-genre or
  unspecified content: it benefits from every register's general-purpose
  signal without any one register's specific quirks distorting it.
  Confirmed by regression test that `register: "general"` behaves
  identically to no register at all, the same pattern used for `email`.
- **2026-08-14: D1 `self-describing-structure` added (etincel-human-signal-spec.md
  Part 2), rebaselined against all six tracked registers, one real regression
  found and fixed, one accepted.** Three pattern families in
  `structural-detectors.ts`'s `detectWholePieceRhythm`/`STRUCTURAL_PATTERNS`:
  family A (a standalone, ≤25-word paragraph announcing a count, "Three
  parts of my track record speak directly to..."), family B (2+ paragraphs
  opening on a bare ordinal or label-fragment slot, "Major gifts, first."),
  family C (narrated intent, "let me walk you through..."), all gated behind
  a 250-word piece floor per the spec's own noted residual-FPR case.

  Measured with `assay run` against a local working-tree build (not a
  published ref), one register at a time, before vs. after:

  | register | before | after | verdict |
  |---|---|---|---|
  | docs | 0.735 | 0.735 | unaffected |
  | blog | 0.8195 | 0.805 -> 0.820 | regressed, fixed |
  | memo | 0.909 | 0.909 | unaffected |
  | essay | 0.900 | 0.884 -> 0.900 | regressed, fixed |
  | email | 0.540 | 0.540 | unaffected |
  | general | 0.757 | 0.748 | regressed, accepted (see below) |

  Both regressions traced to the same root cause: family B firing on
  legitimate ordinal-transition prose in technical/reference writing, the
  exact failure mode the spec itself anticipated for `docs`/`memo` but
  didn't extend further. `essay`'s regression (0.900 -> 0.884) traced to
  one PEP (`pep-0563`) using "First, this only addresses... Second, this
  throws the baby out... Finally, Guido van Rossum declared..." to
  enumerate rationale in ordinary prose. `blog`'s regression (0.8195 ->
  0.805) traced to two Rust release-note posts using "First, a meta
  note..." / "Finally, a few documentation improvements..." as ordinary
  changelog transitions. Both fixed the same way docs/memo already were,
  by adding the register to family B's suppression list in
  `detectWholePieceRhythm` (not `REGISTER_DETECTOR_SUPPRESSIONS`, which
  only covers the flat `STRUCTURAL_PATTERNS` list, see the comment at the
  suppression site for why family B's gate lives inline instead); each fix
  confirmed by re-measuring and landing back on the pre-D1 number.

  `general`'s regression (0.757 -> 0.748) was NOT fixed, on purpose: it
  traces to the same PEP document (part of general's own 24-document mix,
  6 of which are essay-sourced, see the entry above), but `general`
  deliberately inherits no other register's suppressions, term or
  detector, the whole point of the entry above being that any such
  borrowing re-encodes one sub-genre's calibration under a misleading
  "general" label. Suppressing family B for `general` specifically would
  contradict that finding for a single document's sake. The 0.011-point
  drop is accepted and this file's baseline updated to 0.748 to reflect
  it, rather than left wrong or silently patched around; `general` remains
  otherwise unfixed exactly as the entry above describes.

  Family C (narrated intent) is a flat `STRUCTURAL_PATTERNS` entry
  (`narrated-intent-scaffold`), scored the normal density-weighted way, not
  swept separately here: it's a phrase match like any other entry in that
  list, not a whole-piece check.
- **`score.ts` assigns flat strength values** (hard-ban = 80, soft-flag = 45)
  rather than porting each corpus entry's individual `strength_score`,
  since the curated JSON files don't carry that field. Structural patterns
  keep their original per-pattern strength from `structural-patterns.ts`.
  If the full corpus is pulled in later, swap in real per-term
  `strength_score` values for finer-grained scoring.
