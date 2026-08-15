/**
 * Converts character offsets (as carried on Finding.matches) to 1-indexed
 * line/column positions, so CLI and Action output can point at a spot in
 * the file instead of just naming a term. Pure and allocation-light: build
 * the line-start index once per file, then look up each match against it
 * in O(log lines) rather than rescanning the text per match.
 */

/** Offsets (into `text`) where each line begins, index 0 is always 0. */
export function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

export interface LineCol {
  line: number;
  col: number;
}

/** Binary-searches `lineStarts` (see buildLineStarts) for the 1-indexed
 * line/column containing `offset`. */
export function offsetToLineCol(lineStarts: number[], offset: number): LineCol {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - lineStarts[lo] + 1 };
}
