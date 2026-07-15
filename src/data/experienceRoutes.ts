import type { ExperienceRouteAsset } from '../types';
import { experienceGeometry, experienceWaypoint } from './experienceGeometry';

/**
 * VERIFIED GPX route assets — see the ExperienceRouteAsset contract in
 * src/types/index.ts. Experiences reference an asset by its stable `id`
 * (`location.gpxAssetId`); `gpxRefErrors` cross-checks the links at import.
 *
 * All geometry is OWNER-PROVIDED (Day-1 pilot, `day-01-along-the-way.gpx`) and
 * derived from that file at build time (experienceGeometry) — never hand-typed,
 * placeholder or synthetic. Distance/elevation are the out-and-back metrics the
 * generator computed from the supplied track. New assets appear only when the
 * owner supplies/verifies real geometry.
 */
const OWNER_SOURCE = {
  label: 'Owner-authored detour (day-01-along-the-way.gpx)',
  url: 'https://github.com/Algolon/Fjallkompis/blob/claude/along-the-way-mvp/public/gpx/experiences/day-01-along-the-way.gpx',
  lastVerified: '2026-07-15',
};

/** Build a verified out-and-back asset from the owner geometry (rejoin = entry). */
function ownerDetour(experienceId: string, destRole: string): ExperienceRouteAsset {
  const g = experienceGeometry(experienceId);
  const entry = experienceWaypoint(experienceId, 'entry');
  if (!g || !entry) {
    throw new Error(`Missing owner geometry for experience "${experienceId}"`);
  }
  return {
    id: `${experienceId}.detour`,
    experienceId,
    filePath: `gpx/experiences/${g.sourceFile}`,
    routeType: 'out-and-back',
    startCoord: entry,
    destinationCoord: experienceWaypoint(experienceId, destRole),
    rejoinCoord: entry, // owner-confirmed out-and-back
    distanceKm: g.roundTripKm,
    elevationGainM: g.elevationGainM,
    source: OWNER_SOURCE,
    provenance: 'owner-provided',
  };
}

export const EXPERIENCE_ROUTES: ExperienceRouteAsset[] = [
  ownerDetour('abiskojakka-canyon', 'viewpoint'),
  ownerDetour('lake-njakajaure-lapporten', 'primary'),
];

export const EXPERIENCE_ROUTES_BY_ID: Record<string, ExperienceRouteAsset> =
  Object.fromEntries(EXPERIENCE_ROUTES.map((a) => [a.id, a]));
