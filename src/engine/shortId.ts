import { randomInt } from "node:crypto";

/** Excludes 0/O, 1/I/L, and other easily-confused characters, so a short id
 * reads back correctly when someone types or reads it aloud. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LENGTH = 5;

/** A short, memorable, human-typeable stand-in for a voice's real id (a
 * UUID, still the stable primary key everywhere internally). Not
 * cryptographically unguessable, only meant to be easier to say and type
 * than a UUID; callers that mint one are responsible for checking it
 * doesn't collide with an existing one in whatever scope matters to them
 * (see voiceStore.fs.ts and web/lib/voiceStore.neon.ts). */
export function generateShortId(): string {
  let id = "";
  for (let i = 0; i < LENGTH; i++) {
    id += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return id;
}
