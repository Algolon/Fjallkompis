import type { ExperienceRouteAsset } from '../types';

/**
 * VERIFIED GPX route assets for experiences that follow a separate track (not
 * the canonical Kungsleden line) — see the ExperienceRouteAsset contract in
 * src/types/index.ts. Experiences reference an asset by its stable `id`
 * (`location.gpxAssetId`); `gpxRefErrors` cross-checks the links at import.
 *
 * INTENTIONALLY EMPTY. No placeholder, draft, fixture or synthetic tracks ship:
 * for hiking/safety data, missing beats false precision. An asset is added ONLY
 * when the owner supplies or verifies a real track (see the spatial pilot in
 * docs/proposals/along-the-way-spatial.md). Until then, route experiences keep
 * `spatialProvenance: 'missing'` and `mapAvailability: 'unavailable'`.
 */
export const EXPERIENCE_ROUTES: ExperienceRouteAsset[] = [];

export const EXPERIENCE_ROUTES_BY_ID: Record<string, ExperienceRouteAsset> =
  Object.fromEntries(EXPERIENCE_ROUTES.map((a) => [a.id, a]));
