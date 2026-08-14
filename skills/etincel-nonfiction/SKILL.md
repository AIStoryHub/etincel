---
name: etincel-nonfiction
description: Write or revise non-fiction prose (emails, essays, blog posts, memos, newsletters, docs, long-form articles) so it doesn't read as AI-generated, in the user's own trained voice or a chosen preset tone. Use this any time the user is drafting or revising non-fiction prose of meaningful length inside Claude Code, Claude Desktop, or any MCP-enabled tool, even if they don't mention "AI-sounding" or a style by name. This skill layers onto whatever destination the user is writing for (an email client, a CMS, a doc): it never replaces that tool, it only shapes the prose before it gets there.
---

# Étincel Non-Fiction

This skill produces non-fiction prose that reads as if a specific person wrote it, not a model's default output, and it keeps the user in control of every change instead of silently rewriting things behind their back. It pairs with the `etincel-nonfiction` MCP server's tools: `list_styles`, `get_style_guide`, `train_style`, `audit_text`, `set_default_style`, the dictionary tools `add_banned_word`, `remove_banned_word`, `add_custom_word`, `remove_custom_word`, `list_dictionary`, and the instructions tools `set_style_instructions`, `clear_style_instructions`, `get_style_instructions`.

## When to use this skill

Any non-fiction prose request of meaningful length: email, essay, blog post, newsletter, memo, op-ed, LinkedIn long-form, talk script, README intro, PR description, docs section. Also shorter pieces (an opening line, a closing paragraph) when the user signals they care about voice or tone.

Do not use it for: code, structured data, slide bullets, raw outlines, transcripts, or terse status updates. Those aren't prose.

This skill assists whatever the user is already writing in. It does not send emails, publish posts, or manage documents itself; the user (or another tool) still owns sending, publishing, and saving. This skill only shapes text.

## Step 0: pick a style

Before drafting or revising, determine which voice to write in, in this order:

1. If the user names a style or voice in the request, use that.
2. Otherwise call `get_style_guide` with the id from `set_default_style`, if one exists (call `list_styles` to check).
3. Otherwise call `list_styles`, show the user the options (presets and any trained voices), and ask which to use, unless the request is low-stakes (a quick email reply), in which case default to the `direct-warm` preset and mention which one you used.

If the user wants a style trained from their own writing and hasn't trained one yet, offer `train_style`: they supply a few real samples (a few paragraphs each, more samples is better), and it persists a voice profile from measured habits (sentence rhythm, contraction rate, em-dash use, paragraph variance, recurring phrasing), not a vibes-based impression.

The `get_style_guide` output is drafting context for you, the model. It is not itself a generator; you still write the prose, informed by that guide. If the user has saved custom instructions (see below), `get_style_guide` returns them in an `instructions` field, already merged with the global ones: treat that as requirements to satisfy, not just tone to imitate. It's a separate layer from the guide's tone/rhythm text on purpose, so voice and content rules don't get tangled together.

## Step 0.5: get material before drafting

Style processing cannot add information. If a piece needs to read as though a particular person wrote it and you have only the facts a résumé would carry, no amount of rhythm work will get there, because the material that makes writing sound lived is material you don't have. Ask for it first.

**Run this step when the author appears in the text**: first person, persuasive, personal, or any piece where the reader is meant to form a judgment about the writer. Cover letters, application narratives, founder letters, personal essays, talks, fundraising appeals, anything with "why I" in it.

**Skip it for** docs, technical writing, third-person reporting, and short transactional email.

Ask three of these five. Ask them plainly, in one message, and let the user answer loosely.

1. What's a detail you remember about this that proves nothing? A room, a time of day, a sound, something someone said in passing.
2. What's the part of this you'd rather not put in writing? What did you get that other people in the same position didn't?
3. What did you believe about this when you started that turned out to be wrong?
4. What about this still isn't settled for you?
5. If you could keep only one paragraph, which is it?

Pass the answers to `audit_text` as `sourceFacts` at the self-check step, so the audit can tell you whether the draft actually used them. The bar: at least two elicited facts used, at least one of them in a sentence that isn't proving anything.

**If the user declines or has nothing to add**, say so directly rather than proceeding as if nothing changed: without new material this is a rearrangement, and it will read competent and generic. That's more useful to hand someone than a confident draft.

## Composing with other connectors

Étincel is a layer, not a destination: it never needs to be the only tool in the room, and it works best combined with whatever else is already connected in this session.

**Training from writing that already exists.** Don't default to asking the user to paste samples if another connector can get to their own writing directly. If a Gmail, Google Drive, Slack, or similar connector is available and the user wants a style trained on how they actually write, offer to pull the samples yourself first: read a handful of their own sent emails, docs, or messages, then call `train_style` with that text. A prompt like "read my last twenty sent emails and train a style called 'me' from them" should work end to end without the user ever leaving the client. Only fall back to asking for pasted samples if no such connector is present, or the user says they'd rather paste their own.

**Getting material for Step 0.5.** The same connectors can sometimes answer the elicitation questions without the user typing anything. If the piece is about a project and a Drive or Slack connector is present, the messy middle of that project is usually in there: the thread where the plan changed, the message where someone pushed back. Offer to look before you ask.

**Landing the finished draft.** Once a draft is done and audited, check whether a connector matches where it's headed: a Gmail connector for an email, a Slack connector for a message, a Docs connector for a doc. If one is present and the destination is obvious from the request ("draft a reply to Priya," "post this in #launches"), offer to create it there (as a draft, not a sent message, unless the user says to send it) rather than just handing back text. If no matching connector exists, or the destination is ambiguous, hand back the prose as usual and say where it's meant to go.

## Core rules for the draft stage

These apply regardless of which style guide is loaded; the style guide adjusts tone and rhythm on top of them, not instead of them.

### Format

- Full prose. No bullets unless the piece's genre demands them.
- Avoid em dashes by default (parentheses or a comma usually do the job instead), *unless* the loaded style guide says this voice genuinely uses them, then don't strip them.
- Hit the requested length within about ten percent, if one was given.
- Cover sections in the order the user asked for.

### What the draft must contain

Avoidance is not a style. A draft assembled by dodging a list of prohibitions comes out smooth, unobjectionable, and characterless, which is its own recognisable texture. These are requirements, not suggestions, and unlike the avoid-list they can actually be checked.

In any piece over roughly 300 words:

- **One sentence under six words.** Not as decoration. Doing real work in the argument.
- **One paragraph at least twice the median length.** It should be the one the writer cares most about, which is usually not the one carrying the most argumentative weight. Attention that tracks importance is a model's allocation; attention that tracks feeling is a person's.
- **One concrete detail that proves nothing.** A room, a time of day, an object, a thing someone said. Load-bearing specificity ($3.4M, 53%, a client name) is table stakes now and does not count here.
- **One place where something costs the writer.** An admission, an advantage they had, a thing that didn't work, a criticism of someone they need. If nothing in the piece is risky to say, nothing in it will read as a person saying it.
- **One thought that doesn't resolve.** Not every section needs a clean ending; some can stop mid-thought.
- **No sentence describing the piece's own structure.** No "three parts," no "first / second / finally" scaffold, no "let me walk you through." If the organisation is good the reader won't need it announced, and announcing it is one of the most reliable AI fingerprints in first-person prose.
- **No two paragraphs built the same way.** Vary the *shape*, not just the length: where the claim sits, whether evidence comes early or late, whether it ends on a specific or a generalisation. Three paragraphs that each run label → number → small piece of wisdom is one machine run three times, and it reads that way even when every sentence is fine.

### Never invent the specifics

This one overrides everything above it.

Sensory detail, biographical detail, emotional detail, and anything about what a named person did, said, or felt may only come from the user. Never generated, never inferred from context, never plausibly reconstructed because the shape of the paragraph wants something there.

The quotas above create real pressure to fabricate: that's exactly what they ask for, if you have nothing true to fill them with. In a cover letter, a personal essay, or a fundraising appeal, a fabricated detail isn't a style choice. It's a lie told on someone's behalf in a document they're going to sign.

If Step 0.5 produced nothing, write the shorter, drier draft and say plainly which quotas you couldn't meet and why. An honest gap beats an invented rink.

### Vocabulary

Avoid rhetorical-inflation vocabulary that signals AI hype rather than adding information: words like *unlock, unleash, elevate, seamless, robust, holistic, delve, testament, tapestry, journey* (as a metaphor for a process), *game-changer, cutting-edge, in today's fast-paced world, at the end of the day, when it comes to X*. These read as filler because they could describe almost anything; replace them with the specific claim underneath.

Don't over-correct into a second kind of stiffness: technical and analytical words (*framework, benchmark, trajectory, reconcile, nuanced*) are fine when they're the precise word for the context. The goal is specificity, not a banned-word reflex.

#### The user's own dictionary

Beyond this built-in list, the user can maintain their own banned and always-allowed word lists: a corporate dictionary, effectively (an org's acronyms, a term they never want flagged, a phrase they've decided to ban outright). Any time the user says something like "add *[word]* to my banned words list" or "add *[word]* to my custom words list," call `add_banned_word` or `add_custom_word` directly; don't just note it and move on. Pass `styleId` only if they specifically want it scoped to one style; otherwise it goes to the global list, which already applies everywhere automatically, merged in live on every `audit_text`/`list_dictionary` call, nothing further to do to make a global change take effect elsewhere. These lists are checked by `audit_text` automatically once saved; no extra step needed on the next audit.

#### The user's own instructions

Separate from the dictionary and separate from voice: the user can also save free-text drafting rules that layer on top of whichever style is loaded, for things a tone/rhythm guide can't express, required elements ("always end with a CTA"), audience notes ("assume the reader is a technical buyer"), forbidden topics ("never mention pricing"), format constraints. Any time the user says something like "for this style, always..." or "remember: never...", call `set_style_instructions` directly; don't just note it and move on. Pass `styleId` only if it's scoped to one style; otherwise it goes to the global instructions, which apply everywhere and merge underneath any style-specific ones. `get_style_instructions` shows what's saved for a scope; `clear_style_instructions` removes it. You don't need to call any of these before drafting, though, `get_style_guide` already returns the merged, effective instructions for the style in play.

### AI tells to avoid

The quota list above is the primary instrument. This list catches what's left.

- A topic sentence in literally every paragraph
- Every transition spelled out ("Furthermore," "Moreover," "In addition")
- Vague authority ("experts agree," "studies show") without a name or source
- Rule-of-three compulsion, including hidden triads inside a single sentence
- Renaming the same referent for variety instead of repeating the plain word
- A "challenges and opportunities" or "in conclusion" scaffold bolted onto the end
- Throat-clearing openers ("In today's rapidly evolving landscape of...")
- Analogies that resolve too neatly, with no seam where the comparison breaks
- Case studies with no flaw, no wrong turn, no contradiction
- Relentless second person ("You'll find that... You might wonder...")
- "From X to Y" ranges where nothing real sits between X and Y
- Bulleted lists with a bolded term followed by a restatement of that term

### Voice and texture

- Vary sentence length; don't smooth every transition into the same shape.
- Tie abstract claims to something concrete within a sentence or two: an example, a mechanism, a number, a name.
- Real writing includes at least one place, in a substantive piece, where an idea gets revised or a plan didn't survive contact with reality. Don't sanitize the process.
- Named specifics (people, years, numbers, places) beat generic placeholders ("a Fortune 500 company") every time.
- If the user has shared real context about their own work, use it. Lived detail is the strongest single move against AI-feel, and Step 0.5 exists to go get it rather than wait for it.

### Friction is not chrome

Two different things look like flaws in a draft and only one of them should be removed.

**Chrome** is a machine leaving its fingerprints: "I hope this helps," "Certainly! Here's...", a knowledge-cutoff disclaimer, an unfilled `[Company Name]` placeholder in something about to be sent, a stray markdown heading in an email. Always remove it. Always.

**Friction** is a person writing at speed: a missing possessive, two paragraphs in a row opening with "And," a sentence that runs long because the thought did, a closing that says thank you twice. These are evidence of a hand. Prose with zero friction is itself a tell in any genre where people type fast, which is most of them.

The rule when revising: fix what changes the meaning, leave what doesn't. If you catch yourself smoothing a sentence that was already clear, stop.

### Cut before finishing

Before treating a draft as done, cut roughly fifteen percent: throat-clearing openings, mic-drop endings, transitions that only announce what's next, sentences that assert importance without adding information.

Cut from the argument, not from the one disproportionate paragraph. That paragraph is the point.

## Step: self-check before returning

After drafting, call `audit_text` on the result. Pass the register if it's not general prose (`email`, `blog`, `memo`, `essay`, `social`, `docs`, `personal`); pass `styleId` if a specific style was loaded in Step 0, so that style's own dictionary merges in; and pass `sourceFacts` if Step 0.5 produced any, so the audit can check whether the draft used them. This is a deterministic, transparent check, not a black box:

- Read the findings. Fix everything with `confidence: "red"` (severity `high`): these are near-definitive AI fingerprints (chatbot leakage, unfilled placeholders, assistant chrome, an announced structure like "three parts of my track record speak directly to...").
- Fix most `confidence: "orange"` (severity `medium`) findings unless fixing one would break something the user explicitly asked for.
- Use judgment on `confidence: "yellow"` (severity `low`) and below; over-fixing every flagged word produces sterile prose, which is its own tell. The audit is a signal to weigh, not a checklist to exhaustively satisfy.
- A `self-describing-structure` finding (`Whole-piece rhythm` category) is not a word-swap problem. Fixing it means changing what the paragraph *does* (usually: deleting a sentence that announces the organisation, or breaking an ordinal-slot scaffold into paragraphs that argue on their own terms), not editing sentences inside it.
- An `elicited-material-unused` finding means the draft didn't clear Step 0.5's own bar (two elicited facts used, at least one in a sentence that isn't proving anything). Fold in more of what was elicited before returning, or say plainly which quota went unmet if there's nothing left to draw on.
- A green tier is not a pass. The summary says so and it means it: green means nothing in the corpus matched, not that a careful reader would call it human. If the piece meets none of the quotas above, it can be green and still obviously synthetic.
- Check the `strengths` field before fixing anything: it's the other side of the ledger, not just a restated score. A passage with strong strengths signals and a lower-confidence finding is a case for restraint, not a bigger rewrite. Note that specificity density does not distinguish detail that proves something from detail that doesn't, so a high specificity score is not evidence the piece has any texture.
- Do not show the raw audit JSON to the user unless they ask for it. Apply the fixes, then return the revised prose.

## What to return

Just the revised prose, unless the user asked to see the draft, the audit findings, or a change log. No "Here is the revised version," no summary of what changed, no closing offer to keep editing, unless the user's own request calls for that kind of framing (e.g., a code review comment where a short lead-in is normal).

The one exception: if Step 0.5 produced nothing and quotas went unmet, say which ones, in one line, after the prose.

## Revising text that already exists

When the user hands you existing text (their own draft, someone else's, or something you wrote earlier) and asks for changes:

1. Call `audit_text` first and treat it as a diagnostic, not a rewrite trigger.
2. Tell the user what's flagged and why, in plain terms, before changing anything, unless they've already said "just fix it."
3. Make the targeted edits the findings point to. Don't rewrite passages that weren't flagged and weren't asked about; the user's own phrasing that isn't a tell is not a bug.
4. Leave friction alone (see above). Someone else's irregularities are the strongest evidence in the document that a person wrote it.
5. This is the core of "trust mode": the user should be able to see why a change was made and reject any part of it, not just receive a wholesale rewrite.

## Files

- `references/tells-reference.md`: full catalogue of AI tells with short examples, for cases where the inline list above isn't enough detail.
