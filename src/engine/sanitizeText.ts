/**
 * Strips terminal control sequences from freeform text before it's
 * persisted. Guards against stored ANSI/control-byte injection: text saved
 * via one tool call (a voice name, a banned word, a style instruction) that
 * later gets echoed back verbatim inside a different tool's response
 * (get_style_guide, list_dictionary, train_style, ...) could otherwise carry
 * hidden control sequences the model reads but a human wouldn't see in a
 * terminal. Printable text, including non-ASCII prose and em dashes, passes
 * through untouched; only control-byte-range characters are removed. Tab,
 * newline, and carriage return are preserved since they're ordinary prose
 * formatting, not terminal control.
 */
const ESCAPE_SEQUENCE_RE =
  /\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x9d[\s\S]*?(?:\x07|\x9c)|\x9b[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]/g;
const CONTROL_BYTE_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

export function sanitizeFreeformText(text: string): string {
  return text.replace(ESCAPE_SEQUENCE_RE, "").replace(CONTROL_BYTE_RE, "");
}
