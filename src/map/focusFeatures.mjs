/**
 * Build the GeoJSON for a "View on map" detour focus (pure + tested).
 *
 * The transient 'focus' source mixes a route LINE with endpoint POINTS; the map
 * layers filter by geometry type so circles never render the line's vertices.
 * This emits EXACTLY: one LineString for the whole track, plus a `start` Point
 * and (when distinct) a `destination` Point — never the intermediate
 * trackpoints, and never a separate finish marker for an out-and-back route
 * (rejoin == start, so it is not emitted again).
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

export function buildFocusFeatures({ track, start, destination }) {
  const features = [];
  if (Array.isArray(track) && track.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'route' },
      geometry: {
        type: 'LineString',
        coordinates: track.map((t) => [t.lng, t.lat]),
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
