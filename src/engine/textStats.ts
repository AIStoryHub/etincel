export interface TextStats {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  sentenceLengthStdDev: number;
  avgParagraphSentences: number;
  paragraphLengthCV: number;
  contractionRate: number;
  emDashPer1000Words: number;
  semicolonPer1000Words: number;
  questionRate: number;
  avgWordLength: number;
  fragmentRate: number;
  /** Composite "human-messiness" signal, 0-1: how varied sentence openers
   * are (type-token ratio of first words) averaged with how many distinct
   * connective punctuation marks (semicolon, colon, dash, parens, ellipsis)
   * show up at all. Low = same opener repeated, periods only, tidy and
   * predictable, the AI-typical shape. High = openers and punctuation vary
   * unpredictably, the way an unedited human draft does. This is about
   * shape, not correctness: it says nothing about grammar or factual
   * accuracy, and drives the entropy dial (see dials.ts). */
  structuralEntropy: number;
  /** How often the writer addresses "you" or includes the reader/self in
   * "we": count of you/your/yours/we/our/ours/us per 1000 words. Drives the
   * warmth persona dial's inference (see dials.ts's inferPersonaDials): a
   * writer who's rarely on the page with the reader reads reserved, one who
   * keeps directly addressing them reads warm, regardless of vocabulary. */
  relationalPronounRate: number;
  /** Recurring bigrams, ranked by lift (see topBigrams/computeLiftRanked
   * below) rather than raw frequency, so a generic pair that just happens
   * to repeat ("next week", "the team") doesn't crowd out an actually
   * characteristic one. */
  topBigrams: string[];
  /** Same idea as topBigrams, one word at a time: the words this writer
   * reaches for more than a generic baseline would predict, not just the
   * words that happen to repeat because the piece is about them. */
  topWords: string[];
}

const CONTRACTION_RE = /\b\w+['’](?:t|s|re|ve|ll|d|m)\b/gi;
const RELATIONAL_PRONOUN_RE = /\b(?:you|your|yours|we|our|ours|us)\b/gi;
const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;
const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","is","was",
  "are","were","it","that","this","as","at","by","be","has","have","had","i",
  "you","we","they","he","she","not","so","if","from","which","its"
]);

/**
 * Coarse two-tier reference-frequency proxy for lift scoring, not a real
 * corpus frequency table: just "generic, expected everywhere" vs
 * "everything else". Recurring word/bigram selection (topWords/topBigrams
 * below) ranks by how much a word or bigram is OVER-represented against
 * this baseline, not by raw count, so a word that's common in English
 * generally has to repeat a lot before it reads as "characteristic," while
 * an uncommon word only has to repeat a little.
 */
const COMMON_WORDS = new Set([
  ...STOPWORDS,
  "team", "week", "weeks", "time", "times", "work", "today", "people", "thing", "things",
  "way", "ways", "make", "made", "get", "got", "go", "going", "went", "know", "knew",
  "think", "thought", "want", "wanted", "need", "needed", "use", "used", "good", "great",
  "new", "first", "next", "last", "own", "much", "many", "such", "day", "days", "year", "years",
  "really", "just", "also", "now", "still", "even", "back", "see", "saw", "said", "says",
  "one", "two", "three", "like", "well", "right", "little", "big", "long", "different",
  "important", "point", "points", "part", "parts", "world", "company", "project", "plan",
  "plans", "product", "email", "emails", "update", "updates", "meeting", "meetings",
  "call", "calls", "help", "helped", "look", "looked", "looking", "find", "found",
  "give", "gave", "take", "took", "come", "came", "tell", "told", "ask", "asked",
  "start", "started", "keep", "kept", "let", "put", "seem", "seemed", "turn", "turned",
  "move", "moved", "live", "lived", "believe", "hold", "held", "bring", "brought",
  "happen", "happened", "write", "wrote", "provide", "provided", "include", "included",
  "continue", "set", "learn", "learned", "change", "changed", "lead", "led",
  "understand", "understood", "stop", "stopped", "create", "created", "speak", "spoke",
  "read", "add", "added", "spend", "spent", "grow", "grew", "open", "opened",
  "win", "won", "offer", "offered", "remember", "consider", "considered", "wait", "waited",
  "send", "sent", "expect", "expected", "build", "built", "stay", "stayed", "fall", "fell",
]);

const COMMON_WORD_REFERENCE_WEIGHT = 40;
const DEFAULT_WORD_REFERENCE_WEIGHT = 2;

function referenceWeightFor(word: string): number {
  return COMMON_WORDS.has(word) ? COMMON_WORD_REFERENCE_WEIGHT : DEFAULT_WORD_REFERENCE_WEIGHT;
}

/** Rank candidate tokens (words or bigrams) by lift: observed rate per 1000
 * words divided by a reference weight, so a token needs to be genuinely
 * over-represented relative to how common it normally is, not just
 * frequent in absolute terms. Requires at least 2 occurrences: a single
 * mention is a topic, not a recurring habit. */
function topByLift(
  counts: Map<string, number>,
  wordCount: number,
  getReferenceWeight: (token: string) => number,
  limit: number
): string[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([token, count]) => {
      const ratePer1000 = (count / wordCount) * 1000;
      return { token, lift: ratePer1000 / getReferenceWeight(token) };
    })
    .sort((a, b) => b.lift - a.lift)
    .slice(0, limit)
    .map(({ token }) => token);
}

function splitSentences(text: string): string[] {
  const matches = text.match(SENTENCE_SPLIT_RE) ?? [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const variance = mean(nums.map((n) => (n - m) ** 2));
  return Math.sqrt(variance);
}

/**
 * Prose instruction for the entropy signal, operating on the raw 0-1
 * structuralEntropy scale (see dials.ts's DIAL_RANGES.entropy: raw 0.15-0.75
 * maps to the dial's 0-100). dials.ts has its own entropyGuideLine() with
 * matching thresholds/text for presets.ts to call directly on the 0-100
 * dial scale, kept as a second, deliberately duplicated implementation
 * rather than importing across files, because both textStats.ts and
 * dials.ts are loaded directly by client components (NewStyleForm.tsx,
 * EditStyleForm.tsx) for the live dial preview, and Turbopack can't resolve
 * a `.js`-suffixed relative import between them (it doesn't remap `.js` to
 * a sibling `.ts` file the way tsc's NodeNext resolution does): a real
 * runtime import here breaks the client build. If you change the wording,
 * change it in both places.
 */
/** Fallback when a persisted voice profile predates this field (added
 * 2026-08-07) and its stored TextStats has no structuralEntropy on disk/in
 * Postgres, despite the type saying it's required. The raw-scale midpoint
 * of DIAL_RANGES.entropy in dials.ts (0.15-0.75), landing in the "some
 * looseness" mid tier below rather than NaN-ing out the comparisons. */
const NEUTRAL_STRUCTURAL_ENTROPY = 0.39;

function describeEntropy(raw: number): string {
  const v = Number.isFinite(raw) ? raw : NEUTRAL_STRUCTURAL_ENTROPY;
  if (v < 0.33) {
    return "Keep structure tidy and predictable: consistent sentence openers, clean transitions, punctuation kept plain (mostly periods and commas). Orderly reads right here.";
  }
  if (v < 0.54) {
    return "Let some structural looseness through: vary sentence openers now and then instead of repeating the same one, allow an occasional aside, and don't force every list into a neat three-part shape.";
  }
  return "Let structure stay rough at the edges, the way a real draft does: vary how sentences open instead of leaning on 'The' or 'This,' let punctuation choices differ from paragraph to paragraph (a dash here, a parenthetical there, not by formula), skip transitions that just announce the next sentence, and don't force parallel structure. A stray aside or a sentence that doubles back on itself is fine. A typo or a factual error is not; this dial changes shape, not accuracy.";
}

const ENTROPY_PUNCTUATION_MARKS = [";", ":", "—", "(", "…"];

/** Type-token ratio of sentence-opening words: 1.0 means every sentence
 * opens differently, low values mean the same word (often "The"/"This")
 * keeps leading. Needs at least 2 sentences to mean anything. */
function sentenceOpenerDiversity(sentences: string[]): number {
  const openers = sentences
    .map((s) => (s.match(WORD_RE) ?? [])[0]?.toLowerCase())
    .filter((w): w is string => Boolean(w));
  if (openers.length < 2) return 0;
  return new Set(openers).size / openers.length;
}

/** Fraction of the tracked connective-punctuation marks that show up at
 * least once. A piece using only periods and commas scores 0; one mixing
 * semicolons, dashes, and parentheticals scores higher. */
function punctuationVariety(text: string): number {
  const present = ENTROPY_PUNCTUATION_MARKS.filter((mark) => text.includes(mark)).length;
  return present / ENTROPY_PUNCTUATION_MARKS.length;
}

function bigramReferenceWeight(bigram: string): number {
  const [w1, w2] = bigram.split(" ");
  return (referenceWeightFor(w1) + referenceWeightFor(w2)) / 2;
}

function topBigrams(words: string[], wordCount: number, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].toLowerCase();
    const w2 = words[i + 1].toLowerCase();
    if (STOPWORDS.has(w1) && STOPWORDS.has(w2)) continue;
    const key = `${w1} ${w2}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return topByLift(counts, wordCount, bigramReferenceWeight, limit);
}

function topWords(words: string[], wordCount: number, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const raw of words) {
    const w = raw.toLowerCase();
    if (STOPWORDS.has(w) || w.length < 3) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return topByLift(counts, wordCount, referenceWeightFor, limit);
}

export function computeTextStats(text: string): TextStats {
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const words = text.match(WORD_RE) ?? [];
  const wordCount = words.length || 1;

  const sentenceLengths = sentences.map((s) => (s.match(WORD_RE) ?? []).length);
  const paragraphSentenceCounts = paragraphs.map((p) => splitSentences(p).length || 1);

  const contractions = text.match(CONTRACTION_RE) ?? [];
  const relationalPronouns = text.match(RELATIONAL_PRONOUN_RE) ?? [];
  const emDashes = (text.match(/—/g) ?? []).length;
  const semicolons = (text.match(/;/g) ?? []).length;
  const questions = sentences.filter((s) => s.trim().endsWith("?")).length;
  const fragments = sentenceLengths.filter((n) => n > 0 && n <= 3).length;

  const paragraphMean = mean(paragraphSentenceCounts);
  const paragraphStd = stdDev(paragraphSentenceCounts);

  return {
    wordCount,
    sentenceCount: sentences.length,
    avgSentenceLength: Number(mean(sentenceLengths).toFixed(2)),
    sentenceLengthStdDev: Number(stdDev(sentenceLengths).toFixed(2)),
    avgParagraphSentences: Number(paragraphMean.toFixed(2)),
    paragraphLengthCV: paragraphMean > 0 ? Number((paragraphStd / paragraphMean).toFixed(3)) : 0,
    contractionRate: Number(((contractions.length / wordCount) * 100).toFixed(3)),
    emDashPer1000Words: Number(((emDashes / wordCount) * 1000).toFixed(2)),
    semicolonPer1000Words: Number(((semicolons / wordCount) * 1000).toFixed(2)),
    questionRate: sentences.length > 0 ? Number((questions / sentences.length).toFixed(3)) : 0,
    avgWordLength: Number((words.reduce((a, w) => a + w.length, 0) / wordCount).toFixed(2)),
    fragmentRate: sentences.length > 0 ? Number((fragments / sentences.length).toFixed(3)) : 0,
    structuralEntropy: Number(
      ((sentenceOpenerDiversity(sentences) + punctuationVariety(text)) / 2).toFixed(3)
    ),
    relationalPronounRate: Number(((relationalPronouns.length / wordCount) * 1000).toFixed(2)),
    topBigrams: topBigrams(words, wordCount),
    topWords: topWords(words, wordCount),
  };
}

export function mergeStats(perSample: TextStats[]): TextStats {
  if (perSample.length === 1) return perSample[0];
  const totalWords = perSample.reduce((a, s) => a + s.wordCount, 0);
  const weight = (s: TextStats) => s.wordCount / totalWords;
  const wsum = (key: keyof TextStats) =>
    perSample.reduce((a, s) => a + (s[key] as number) * weight(s), 0);

  /** Merges a per-sample lift-ranked list by how many samples it shows up
   * in: a bigram/word that reads as characteristic across several samples
   * beats one that was merely top-ranked in a single one. */
  function mergeByPresence(key: "topBigrams" | "topWords"): string[] {
    const presenceCounts = new Map<string, number>();
    for (const s of perSample) {
      for (const token of s[key]) presenceCounts.set(token, (presenceCounts.get(token) ?? 0) + 1);
    }
    return [...presenceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([token]) => token);
  }

  return {
    wordCount: totalWords,
    sentenceCount: perSample.reduce((a, s) => a + s.sentenceCount, 0),
    avgSentenceLength: Number(wsum("avgSentenceLength").toFixed(2)),
    sentenceLengthStdDev: Number(wsum("sentenceLengthStdDev").toFixed(2)),
    avgParagraphSentences: Number(wsum("avgParagraphSentences").toFixed(2)),
    paragraphLengthCV: Number(wsum("paragraphLengthCV").toFixed(3)),
    contractionRate: Number(wsum("contractionRate").toFixed(3)),
    emDashPer1000Words: Number(wsum("emDashPer1000Words").toFixed(2)),
    semicolonPer1000Words: Number(wsum("semicolonPer1000Words").toFixed(2)),
    questionRate: Number(wsum("questionRate").toFixed(3)),
    avgWordLength: Number(wsum("avgWordLength").toFixed(2)),
    fragmentRate: Number(wsum("fragmentRate").toFixed(3)),
    structuralEntropy: Number(wsum("structuralEntropy").toFixed(3)),
    relationalPronounRate: Number(wsum("relationalPronounRate").toFixed(2)),
    topBigrams: mergeByPresence("topBigrams"),
    topWords: mergeByPresence("topWords"),
  };
}

export function describeStats(stats: TextStats): string {
  const lines: string[] = [];
  lines.push(
    stats.avgSentenceLength >= 20
      ? "Sentences run long on average; let complex sentences stand rather than chopping them up."
      : stats.avgSentenceLength <= 12
      ? "Sentences run short on average; favor short declaratives over compound sentences."
      : "Sentence length is moderate; mix short and medium sentences."
  );
  lines.push(
    stats.sentenceLengthStdDev >= 8
      ? "Sentence length varies a lot within a piece: keep that variance, don't smooth it out."
      : "Sentence length is fairly consistent, but don't over-flatten it into uniformity."
  );
  lines.push(
    stats.paragraphLengthCV >= 0.5
      ? "Paragraph length is uneven, some short, some long. Preserve that asymmetry."
      : "Paragraphs tend to run a similar length; still vary at least one paragraph per piece to avoid a uniform grid."
  );
  lines.push(
    stats.contractionRate >= 1.5
      ? "Uses contractions freely, even in substantive writing."
      : stats.contractionRate <= 0.3
      ? "Rarely uses contractions; keep a more formal register."
      : "Uses contractions occasionally."
  );
  lines.push(
    stats.emDashPer1000Words >= 3
      ? "Uses em dashes as a real punctuation choice for this writer; unlike the general house rule, don't strip them here."
      : "Avoids em dashes; use commas or parentheses instead."
  );
  if (stats.fragmentRate >= 0.08) {
    lines.push("Comfortable with sentence fragments for emphasis.");
  }
  if (stats.questionRate >= 0.05) {
    lines.push("Occasionally poses direct questions to the reader or to itself.");
  }
  if (stats.topBigrams.length > 0) {
    lines.push(`Recurring phrasing across samples: ${stats.topBigrams.slice(0, 5).join(", ")}.`);
  }
  if (stats.topWords.length > 0) {
    lines.push(`Distinctive word choices, reached for more than a generic baseline would predict: ${stats.topWords.slice(0, 5).join(", ")}.`);
  }
  lines.push(describeEntropy(stats.structuralEntropy));
  return lines.join(" ");
}
