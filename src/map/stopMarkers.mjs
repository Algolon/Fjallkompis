/**
 * Pure, DOM-free logic behind the Map's hut markers and the anchored stop
 * preview popup: display/accessible labels and the facility summary spoken
 * to assistive technology. Kept in a plain .mjs module so node --test can
 * exercise it directly (see tests/map-stop-markers.test.mjs); MapView and
 * MapScreen import it for rendering.
 */

/** Route endpoints get a subtle accent; the hut meaning stays dominant. */
export function isEndpointWaypoint(waypointId) {
  return waypointId.startsWith('START_') || waypointId.startsWith('END_');
}

/** Short marker label — waypoint names minus the organisation prefix. */
export function markerLabel(waypointName) {
  return waypointName.replace(/^STF\s+/, '');
}

/** Accessible name for a hut marker button. */
export function markerAriaLabel(waypointName) {
  return `Open preview for ${markerLabel(waypointName)}`;
}

/** Accessible name for the popup's single navigation action. */
export function popupActionLabel(stopShortName) {
  return `Open ${stopShortName} details in Huts & Stations`;
}

/**
 * Concise spoken summary of the popup's facility preview, so assistive
 * technology gets one sentence instead of a run of decorative icons.
 * Absence labels arrive pre-phrased ("No shop") from the stop data.
 */
export function facilitySummary(presentLabels, absenceLabels) {
  const parts = [];
  if (presentLabels.length === 1) {
    parts.push(`Facilities: ${presentLabels[0]}.`);
  } else if (presentLabels.length > 1) {
    parts.push(
      `Facilities: ${presentLabels.slice(0, -1).join(', ')} and ${
        presentLabels[presentLabels.length - 1]
      }.`,
    );
  }
  for (const absence of absenceLabels) parts.push(`${absence}.`);
  return parts.join(' ');
}
