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
  `soft-flag-terms.json` (341 + 126 = 467 entries as of 2026-08-09, plus
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
- **`score.ts` assigns flat strength values** (hard-ban = 80, soft-flag = 45)
  rather than porting each corpus entry's individual `strength_score`,
  since the curated JSON files don't carry that field. Structural patterns
  keep their original per-pattern strength from `structural-patterns.ts`.
  If the full corpus is pulled in later, swap in real per-term
  `strength_score` values for finer-grained scoring.
