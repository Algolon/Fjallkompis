/**
 * Pure Today-hero derivations for a planned hiking day.
 *
 * The saved plan owns leg order and plannedDays.mjs resolves every leg to an
 * oriented view of verified route data. These helpers only project that data
 * into compact presentation/navigation shapes; they never recalculate route
 * statistics or join discontinuous legs with invented geometry.
 */

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** Ordered segment rows. Repeated stages remain repeated occurrences. */
export function hikingDaySegments(day) {
  if (!day || !Array.isArray(day.legs)) return [];
  return day.legs.flatMap((leg, index) => {
    const stage = leg?.stage;
    if (!stage) return [];
    return [{
      id: typeof leg.id === 'string' ? leg.id : `${leg.stageId ?? 'stage'}-${index}`,
      stageId: typeof leg.stageId === 'string' ? leg.stageId : stage.id,
      fromStopId: typeof stage.fromHutId === 'string' ? stage.fromHutId : null,
      toStopId: typeof stage.toHutId === 'string' ? stage.toHutId : null,
      distanceKm: finite(stage.distanceKm) ? stage.distanceKm : null,
    }];
  });
}

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
