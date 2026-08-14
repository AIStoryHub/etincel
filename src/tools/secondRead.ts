import type { SecondReadSource } from "../engine/secondReadSource.js";

export async function secondReadTool(source: SecondReadSource, text: string) {
  if (!text || text.trim().length === 0) {
    throw new Error("Nothing to read: text was empty.");
  }
  return source.secondRead(text);
}
