import type { ExperienceRouteAsset, LatLng } from '../types';
import { experienceGeometry, experienceWaypoint } from './experienceGeometry';

/**
 * VERIFIED GPX route assets — see the ExperienceRouteAsset contract in
 * src/types/index.ts. Experiences reference an asset by its stable `id`
 * (`location.gpxAssetId`); `gpxRefErrors` cross-checks the links at import.
 *
 * All geometry is OWNER-PROVIDED and derived from the supplied GPX files at build
 * time (experienceGeometry) — never hand-typed, placeholder or synthetic.
 * Distance/elevation are the out-and-back metrics the generator computed from the
 * supplied track. Point-only off-trail objectives get NO asset here (they have no
 * route). New assets appear only when the owner supplies/verifies real geometry.
 */

/** Owner-source attribution for an experience route, keyed to its GPX file. */
function ownerSource(sourceFile: string) {
  return {
    label: `Owner-authored route (${sourceFile})`,
    url: `https://github.com/Algolon/Fjallkompis/blob/main/public/gpx/experiences/${sourceFile}`,
    lastVerified: '2026-07-16',
  };
}

/** First / last point of the derived track as a LatLng (fallback for markers). */
function trackEnd(id: string, which: 'first' | 'last'): LatLng | undefined {
  const g = experienceGeometry(id);
  if (!g?.track?.length) return undefined;
  const [lat, lng] = which === 'first' ? g.track[0] : g.track[g.track.length - 1];
  return { lat, lng };
}

/**
 * Build a verified out-and-back asset from the owner geometry. The start marker
 * is the `entry` waypoint (or, when a file supplies none, the track's first
 * point); the destination marker is the named `destRole` waypoint (or the
 * track's last point). Return distance/ascent come straight from the geometry.
 */
function ownerDetour(experienceId: string, destRole: string): ExperienceRouteAsset {
  const g = experienceGeometry(experienceId);
  if (!g || !g.track) {
    throw new Error(`Missing owner geometry/track for experience "${experienceId}"`);
  }
  const start = experienceWaypoint(experienceId, 'entry') ?? trackEnd(experienceId, 'first');
  const destination =
    experienceWaypoint(experienceId, destRole) ?? trackEnd(experienceId, 'last');
  if (!start) {
    throw new Error(`No start (entry/track) for experience "${experienceId}"`);
  }
  return {
    id: `${experienceId}.detour`,
    experienceId,
    filePath: `gpx/experiences/${g.sourceFile}`,
    routeType: 'out-and-back',
    startCoord: start,
    destinationCoord: destination,
    rejoinCoord: start, // owner-confirmed out-and-back
    distanceKm: g.roundTripKm,
    elevationGainM: g.elevationGainM,
    source: ownerSource(g.sourceFile),
    provenance: 'owner-provided',
  };
}

export const EXPERIENCE_ROUTES: ExperienceRouteAsset[] = [
  // Day-1 pilot detours.
  ownerDetour('abiskojakka-canyon', 'viewpoint'),
  ownerDetour('lake-njakajaure-lapporten', 'primary'),
  // Days 4–7 routed detours (owner GPX). Point-only off-trail objectives
  // (salka-half-summit-lake-viewpoint, madirjavri-plateau-viewpoint) are absent
  // by design — they have no route.
  ownerDetour('nallo-side-valley', 'destination'),
  ownerDetour('day5-waterfall-rapids-bridge', 'destination'),
  ownerDetour('tarfala-valley', 'destination'),
  ownerDetour('kebnekaise-summit-western', 'summit'),
];

export const EXPERIENCE_ROUTES_BY_ID: Record<string, ExperienceRouteAsset> =
  Object.fromEntries(EXPERIENCE_ROUTES.map((a) => [a.id, a]));
