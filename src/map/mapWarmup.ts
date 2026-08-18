/**
 * Deferred warm-up of the map work a cold first Map open would otherwise pay
 * on its user-visible critical path.
 *
 * WHAT it warms — exactly one thing: the vector basemap bundled in the
 * Android app package, whose full ~6 MB read (src/map/archiveStore.ts,
 * `getBundledArchiveBlob`) sits directly in front of the MapLibre constructor
 * on the first Map mount of a session. Optional archives (terrain, contours,
 * satellite) are deliberately NOT warmed: they live in native files read in
 * slices, cost no comparable up-front read, and warming them would be
 * speculative I/O for layers the user may never enable. Nothing here ever
 * fetches from the network — a bundled archive is by definition already on
 * the device, and off Android the store refuses the warm-up outright.
 *
 * WHEN — strictly after the initial UI work, via the idle/deferred policy in
 * src/map/warmupScheduling.mjs. The start destination keeps boot priority.
 *
 * WHERE that "Android only" decision lives: in the archive store, NOT here.
 * src/map/archiveStore.ts is the one platform boundary for map data
 * (`prewarmBundledArchive` resolves false anywhere the archive is not served
 * from the app package), so this module — like MapView and the Settings
 * cards — never asks which platform it is on. In a browser or installed PWA
 * the scheduled callback finds nothing bundled and does nothing: no read, no
 * blob, no behaviour change.
 *
 * This module is the semantic seam App.tsx talks to: the shell asks for "the
 * map, warmed" and learns nothing about PMTiles, blobs or archive specs.
 */
import { VECTOR_ARCHIVE } from './offlineMap';
import { prewarmBundledArchive } from './archiveStore';
import { scheduleWarmup } from './warmupScheduling.mjs';

let scheduled = false;

/**
 * Schedule the one-time session warm-up. Safe to call repeatedly (StrictMode
 * double-invokes effects): the first call schedules, the rest are no-ops, and
 * the underlying read is session-cached anyway. Failure is swallowed —
 * normal Map resolution remains the fallback (and a failed read evicts
 * itself, see prewarmBundledArchive).
 */
export function prewarmMapAssets(): void {
  if (scheduled) return;
  scheduled = true;
  scheduleWarmup(() => {
    void prewarmBundledArchive(VECTOR_ARCHIVE);
  });
}
