/**
 * Resolve a final Today-only arrival Stay without changing the persisted Day
 * plan or the general planned-day derivation.
 *
 * The normal overnight rules have already run before this helper is called.
 * It therefore acts only when the shown day still has no overnight, is a
 * travel-only arrival day, and exactly one personal Stay is linked to the
 * verified start Stop of the next Hiking day. Dates are not reinterpreted
 * here: a real date-covering Stay would already have won earlier. Several
 * linked stays remain ambiguous and free-text locations are never inferred.
 */
export function resolveTodayArrivalStay(day, plannedDays, tripItems) {
  if (!day || day.overnight?.kind !== 'none') return day;

  const activities = Array.isArray(day.activities) ? day.activities : [];
  const travelOnly =
    activities.length > 0 && activities.every((activity) => activity?.kind === 'travel');
  if (!travelOnly || !Array.isArray(plannedDays) || !Array.isArray(tripItems)) return day;

  const dayIndex = plannedDays.findIndex((candidate) => candidate?.id === day.id);
  if (dayIndex < 0) return day;

  let nextHikingStartStopId = null;
  for (let index = dayIndex + 1; index < plannedDays.length; index++) {
    const firstStage = plannedDays[index]?.stages?.[0];
    if (firstStage?.fromHutId) {
      nextHikingStartStopId = firstStage.fromHutId;
      break;
    }
  }
  if (!nextHikingStartStopId) return day;

  const linkedStays = tripItems.filter(
    (item) =>
      item?.kind === 'stay' &&
      item.linkedPlaceId === nextHikingStartStopId &&
      typeof item.id === 'string' &&
      item.id.length > 0,
  );
  if (linkedStays.length !== 1) return day;

  const overnight = {
    kind: 'stay',
    tripItemId: linkedStays[0].id,
    source: 'trip-stay',
  };
  return {
    ...day,
    overnight,
    derivedOvernight: overnight,
  };
}
