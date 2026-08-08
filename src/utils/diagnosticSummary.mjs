/**
 * "Copy diagnostic summary" — the mobile pilot's manual error-report helper.
 *
 * STRICTLY non-personal by construction: the builder prints exactly the
 * technical fields named below and nothing else. Notes, trip details,
 * documents, location history and any other personal data have no path into
 * this string — extra keys on the facts object are ignored, absent keys
 * print as 'unknown'. Guarded by tests/diagnostic-summary.test.mjs.
 *
 * Plain .mjs so node --test exercises it without a DOM.
 */

const FIELDS = [
  ['appVersion', 'App version'],
  // Key deliberately NOT named "contentVersion": the authority for that name
  // lives in trailMetadata.mjs alone (tests/trail-content-metadata.test.mjs);
  // this field only carries the derived display string.
  ['content', 'Content version'],
  ['schemaVersion', 'Schema version'],
  ['routeDirection', 'Route direction'],
  ['platform', 'Platform'],
  ['displayMode', 'Display mode'],
  ['serviceWorker', 'Service worker'],
  ['storage', 'Local storage'],
  ['offlineBasemap', 'Offline basemap'],
  ['terrain', 'Terrain relief'],
  ['satellite', 'Satellite imagery'],
];

/** Build the plain-text summary from explicitly whitelisted technical facts. */
export function buildDiagnosticSummary(facts = {}) {
  const lines = ['Fjallkompis diagnostic summary'];
  for (const [key, label] of FIELDS) {
    const value = facts[key];
    lines.push(
      `${label}: ${value === undefined || value === null || value === '' ? 'unknown' : String(value)}`,
    );
  }
  return lines.join('\n');
}
