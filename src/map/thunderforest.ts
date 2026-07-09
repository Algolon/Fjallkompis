/**
 * The ONE place the Thunderforest API key enters the app.
 *
 * Build-time injection (VITE_THUNDERFOREST_API_KEY, see .env.example and
 * docs/DEVELOPMENT.md) keeps the key out of tracked files and git history —
 * it does NOT keep it secret at runtime: the built browser application
 * embeds it in the bundle and exposes it in every tile-request URL (Referer
 * information may also be visible to Thunderforest). Relevant controls:
 * quota monitoring, temporary deployment, key rotation/removal afterwards;
 * an origin allowlist only if the Thunderforest dashboard actually supports
 * one.
 *
 * Without a key the value is null, the comparison option renders as
 * unavailable, and no Thunderforest request is ever made.
 */
export const THUNDERFOREST_API_KEY: string | null =
  (import.meta.env.VITE_THUNDERFOREST_API_KEY ?? '').trim() || null;

/**
 * Selectable only when BOTH the benchmark flag and the key are present —
 * the selector itself is gated by benchmarkEnabled (benchmarkFlag.ts), so
 * this stays a pure key check.
 */
export const thunderforestAvailable = THUNDERFOREST_API_KEY != null;

if (import.meta.env.DEV && !thunderforestAvailable) {
  // Dev-only, deliberately concise: enough to explain the disabled option
  // without leaking configuration details into production consoles.
  console.info(
    '[fjallkompis] Thunderforest comparison layer unavailable: set VITE_THUNDERFOREST_API_KEY in .env.local (see .env.example).',
  );
}
