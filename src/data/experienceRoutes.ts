import type { ExperienceRouteAsset } from '../types';
import { STOPS_BY_ID } from './stops';

/**
 * GPX route assets for experiences that follow a SEPARATE track (not the
 * canonical Kungsleden line) — see the ExperienceRouteAsset contract in
 * src/types/index.ts. Experiences reference an asset by its stable `id`
 * (`location.gpxAssetId`), never by filename, so a rename can't silently break
 * the link (cross-checked by gpxRefErrors at import in routeExperiences.ts).
 *
 * Deliberately sparse: only experiences whose route genuinely needs a track get
 * an asset. The Kebnekaise entry ships as a DRAFT placeholder/fixture (its GPX
 * is not a verified survey) to exercise the contract and the route-based
 * "View on map" wiring — see public/gpx/experiences/kebnekaise-summit-western.gpx.
 * Do NOT create assets for all experiences, and do not promote a draft to
 * 'verified' without a real track.
 */
export const EXPERIENCE_ROUTES: ExperienceRouteAsset[] = [
  {
    id: 'kebnekaise-summit-western',
    experienceId: 'kebnekaise-summit-western',
    filePath: 'gpx/experiences/kebnekaise-summit-western.gpx',
    routeType: 'out-and-back',
    // Trailhead is the station itself — a real, mapped coordinate, not invented.
    startCoord: STOPS_BY_ID['kebnekaise'].coord,
    // Summit coordinate intentionally omitted until verified (status: draft).
    distanceKm: 18,
    elevationGainM: 1700,
    source: {
      label: 'STF — Climbing Kebnekaise',
      url: 'https://www.swedishtouristassociation.com/guides/climbing-kebnekaise/',
      lastVerified: '2026-07-12',
    },
    status: 'draft',
  },
];

export const EXPERIENCE_ROUTES_BY_ID: Record<string, ExperienceRouteAsset> =
  Object.fromEntries(EXPERIENCE_ROUTES.map((a) => [a.id, a]));
