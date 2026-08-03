/**
 * Pure Today-hero navigation derivation for a planned hiking day.
 *
 * The saved plan owns leg order and plannedDays.mjs resolves every leg to an
 * oriented view of verified route data. This helper only projects that data
 * into the Map focus shape; it never recalculates route statistics or joins
 * discontinuous legs with invented geometry. (The hero itself communicates a
 * combined day through its aggregate subtitle — the per-segment row list was
 * retired for compactness; leg order still lives in the plan and drives the
 * guide/route navigation below.)
 */

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Verified map geometry for the whole walking day.
 *
 * Each leg stays a separate track. That matters for personalised plans which
 * can revisit or skip route sections: concatenating them into one LineString
 * would draw a synthetic connector between unrelated endpoints. MapView can
 * render the resulting tracks as one focused full-day route without implying
 * geometry that the supplied GPX does not contain.
 */
export function hikingDayRouteFocus(day) {
  if (!day || !Array.isArray(day.legs)) return null;
  const tracks = day.legs.flatMap((leg) => {
    const points = Array.isArray(leg?.stage?.points) ? leg.stage.points : [];
    const track = points
      .filter((point) => finite(point?.lat) && finite(point?.lon))
      .map((point) => ({ lat: point.lat, lng: point.lon }));
    return track.length >= 2 ? [track] : [];
  });
  if (tracks.length === 0) return null;
  return {
    tracks,
    start: tracks[0][0],
    destination: tracks[tracks.length - 1][tracks[tracks.length - 1].length - 1],
  };
}
