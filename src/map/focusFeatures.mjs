/**
 * Build the GeoJSON for a "View on map" route focus (pure + tested).
 *
 * The transient 'focus' source mixes a route LINE with endpoint POINTS; the map
 * layers filter by geometry type so circles never render the line's vertices.
 * A focus may contain one owner-supplied detour track OR several verified
 * route-stage tracks for a personalised walking day. Tracks remain separate
 * LineStrings so a non-contiguous day never gains an invented connector.
 * Start/destination are Point features only; intermediate vertices never are.
 *
 * Coordinates are `{ lat, lng }` in; GeoJSON `[lng, lat]` out.
 */

const EPS = 1e-6;
const same = (a, b) =>
  !!a && !!b && Math.abs(a.lat - b.lat) < EPS && Math.abs(a.lng - b.lng) < EPS;

function pointFeature(p, role) {
  return {
    type: 'Feature',
    properties: { role },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  };
}

export function buildFocusFeatures({ track, tracks, start, destination }) {
  const features = [];
  const routeTracks = Array.isArray(tracks) && tracks.length > 0 ? tracks : [track];
  for (const routeTrack of routeTracks) {
    if (!Array.isArray(routeTrack) || routeTrack.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: { kind: 'route' },
      geometry: {
        type: 'LineString',
        coordinates: routeTrack.map((t) => [t.lng, t.lat]),
      },
    });
  }
  if (start) features.push(pointFeature(start, 'start'));
  // Out-and-back: rejoin == start, so a distinct destination only when it isn't
  // the same coordinate as the start.
  if (destination && !same(start, destination)) {
    features.push(pointFeature(destination, 'destination'));
  }
  return { type: 'FeatureCollection', features };
}
