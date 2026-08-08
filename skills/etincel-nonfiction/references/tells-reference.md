# AI tells reference

Expanded catalogue for the core list in SKILL.md. Each entry: the pattern, why it reads as AI, and a quick before/after.

None of these are proof on their own; a human on deadline can produce any single one. Weight by cluster: three or four of these together in one piece is a strong signal; one, in isolation, usually isn't.

## Structural (whole-piece) tells

**Uniform paragraph length.** Every paragraph runs four to six sentences. Human writing clusters unevenly: some paragraphs are one line, some run long because the idea needed the room.

**Symmetric elaboration.** Every point gets exactly the same depth of treatment, as if working down a checklist. Real arguments spend more time where the stakes or the difficulty actually are.

**Clean resolution every paragraph.** Each paragraph opens a thought and closes it neatly before the next one starts. Real writing sometimes carries a thought across paragraphs, or lets one end without wrapping it up.

**Topic sentence every time.** Reads like a five-paragraph essay template. Vary it: open some paragraphs mid-idea, or with a concrete detail instead of a claim.

**Stacked transitions.** "Furthermore... Moreover... In addition... As a result..." Every logical link spelled out removes the reader's job of following the argument, which is part of what makes prose feel alive.

**Rule-of-three compulsion.** Three examples, three reasons, three adjectives in a row ("fast, reliable, and scalable"), including hidden triads inside a single sentence. Two examples or four are both fine; three is a tell specifically because it's the reflex.

**Elegant variation.** Renaming the same referent for variety ("the company... the organization... this enterprise...") instead of just repeating the plain word, which is what most writers actually do.

**Challenges-and-prospects scaffolding.** A closing section that pivots to generic future-facing language ("As the field continues to evolve, challenges remain, but the opportunities are significant") without saying anything specific.

## Sentence-level tells

**Copulative avoidance.** Refusing to write "is" or "has" in favor of "serves as," "functions as," "represents." Plain verbs are usually stronger.

**Participial padding.** "-ing" clauses tacked onto a sentence that just restate it: "The team shipped the feature, demonstrating their commitment to quality." Cut the tail or make it say something new.

**Significance inflation.** "This represents a pivotal moment," "this cannot be overstated," "it is worth noting that." Let the fact carry its own weight; asserting importance is not the same as showing it.

**Vague authority attribution.** "Experts agree," "studies show," "many believe" with no name, no source, no number. If there's a real source, name it. If there isn't, cut the claim or mark it as the writer's own view.

**False ranges.** "From startups to Fortune 500 companies" when nothing concrete sits between those two poles. If the range isn't doing real work, name the actual case instead.

**Two-sentence negation.** "X. Y, however, took a different path." A specific rhythmic tic that shows up disproportionately in AI output; vary how contrast gets introduced.

## Formatting tells

**Bullet with bolded title.** "**Speed:** the system responds quickly." The bold term and the sentence after it usually say the same thing twice; either cut the bold lead-in or make the sentence add information the term doesn't already convey.

**Bold as textbook.** Bolding ordinary vocabulary inside running prose, as if the reader needs vocabulary highlighted. Reserve bold for genuine emphasis, rarely.

## Tone tells

**Tourism-brochure tone.** Warm, admiring, selling the subject rather than describing it: "a vibrant ecosystem," "a rich tapestry of innovation." If the piece is describing a place, a company, or a field, describe what's actually there instead of how impressive it sounds.

**Relentless second person.** "You'll find that... You might wonder... You've probably experienced..." used as a rhetorical device rather than because the writer is actually addressing the reader directly. Fine occasionally; exhausting as a structural default.

**Vague-landscape openers.** "In today's rapidly evolving landscape of X" as a throat-clearing opener that could preface almost any topic. Open with the actual first fact, person, number, or claim instead.

**Editorializing markers.** "It is worth noting that," "no discussion would be complete without," "it goes without saying." These announce that a point is coming instead of just making the point.

## Near-definitive fingerprints (flag on a single hit)

These are strong enough that one instance is enough to flag, regardless of the rest of the piece:

- Chatbot self-disclosure: "As an AI language model," "I don't have access to real-time information," "as of my last update"
- Assistant chrome that leaked into the final text: "Would you like me to...?", "I hope this helps!", "Here is a comprehensive overview of..."
- Unfilled placeholders: `[Your Name]`, `[INSERT LINK]`, `2025-XX-XX`
- Citation or markup artifacts from a chat UI that weren't cleaned up before pasting

## Missing-friction tells (what to add, not just remove)

- No named person, only role or category ("a Fortune 500 financial services firm" instead of the actual company and year)
- No moment of doubt, no revised view, no wrong turn in a substantive argument
- No acknowledged friction in the process behind the piece ("this took longer than expected," "we thought that would work and it didn't")
- Metaphors that fit too perfectly, with no seam where the comparison would break down if pushed
