/**
 * The judgment layer: a single model call that reads a draft and reports
 * what a careful human editor would notice, unscored and untiered, never a
 * rewrite. Distinct from audit_text, which is deterministic and
 * reproducible (same input always produces the same tier); second_read is
 * neither, so it never gates CI, never contributes to a tier or score, and
 * is never presented as ground truth the way a finding is.
 *
 * The local (stdio) install has no account to bill a model call against
 * and no pinned model/prompt of its own, so it only ever gets
 * localSecondReadSource below, which explains that clearly instead of
 * silently returning nothing. The real implementation lives on the hosted
 * server (web/lib/secondRead.ts, mirroring hostedPublicStyleSource.ts's
 * relationship to publicStyleSource.ts).
 */

export interface SecondReadObservation {
  /** The exact span from the draft this observation is about, quoted
   * verbatim so a caller can locate it without re-searching the text.
   * Absent when an observation is about the piece as a whole rather than
   * one specific span. */
  quote?: string;
  /** What a careful reader would notice here, in prose. Never a suggested
   * rewrite: see the module comment for why a rewrite is out of scope. */
  observation: string;
}

export interface SecondReadResult {
  /** Empty is a real, valid result (nothing stood out to a careful
   * reader), not a failure or an unset field: a caller should not treat
   * an empty array as "second_read didn't run". */
  observations: SecondReadObservation[];
  /** Which model produced this read, so a caller can show provenance
   * instead of presenting the result as ground truth: unlike audit_text,
   * the same input is not guaranteed to produce the same output twice. */
  model: string;
}

export interface SecondReadSource {
  secondRead(text: string): Promise<SecondReadResult>;
}

/** The local (stdio) install's implementation: always unavailable, with an
 * explanation of why, rather than silently returning an empty result that
 * could be mistaken for "a careful read found nothing." */
export const localSecondReadSource: SecondReadSource = {
  async secondRead() {
    throw new Error(
      "second_read requires the hosted server (https://etincel.ai/api/mcp): it makes a model call, which needs an account, a pinned model, and a billing surface the local install doesn't have. audit_text still works fully offline, no account needed."
    );
  },
};
