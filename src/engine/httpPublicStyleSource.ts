import type { PublicStyleSource } from "./publicStyleSource.js";

const DEFAULT_BASE_URL = "https://etincel.ai";

/** Shape of GET /api/styles/public/{handle}/{slug} (see
 * web/app/api/styles/public/[handle]/[slug]/route.ts): only the fields
 * this reads are declared here. */
interface PublicStyleResponse {
  guide: string;
  dials: { formality: number; warmth: number; directness: number };
}

/**
 * Fetches a published style from the hosted gallery's public JSON API: the
 * only way the local (stdio) install, which otherwise never makes a
 * network call, can reach a style someone else published. No auth: the
 * endpoint only ever serves rows the owner marked public.
 *
 * baseUrl defaults to the live etincel.ai gallery; override via
 * ETINCEL_HOSTED_URL for local development against a locally-running web
 * app.
 */
export function createHttpPublicStyleSource(
  baseUrl: string = process.env.ETINCEL_HOSTED_URL ?? DEFAULT_BASE_URL
): PublicStyleSource {
  return {
    async getPublicStyle(handle, slug) {
      const url = `${baseUrl}/api/styles/public/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        // Offline, DNS failure, etc.: a real problem worth surfacing on
        // its own terms, not silently reported as "no such style".
        throw new Error(`Could not reach the public style gallery at ${baseUrl}. Check your connection and try again.`);
      }
      if (response.status === 404) return undefined;
      if (!response.ok) {
        throw new Error(`The public style gallery returned an error (${response.status}) for "${handle}/${slug}".`);
      }
      const data = (await response.json()) as PublicStyleResponse;
      return {
        guide: data.guide,
        formality: data.dials.formality,
        warmth: data.dials.warmth,
        directness: data.dials.directness,
      };
    },
  };
}
