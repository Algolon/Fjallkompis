import { useStore } from '../store/AppStore';
import { useServiceWorkerControlled } from './useServiceWorkerControlled';
import {
  useCombinedArchiveStatus,
  type ArchiveCombinedStatus,
} from '../components/OfflineMapCard';
import {
  VECTOR_ARCHIVE,
  TERRAIN_ARCHIVE,
  CONTOURS_ARCHIVE,
  SATELLITE_ARCHIVE,
} from '../map/offlineMap';

export interface OfflineDiagnostics {
  swControlled: boolean;
  storageOk: boolean;
  basemap: ArchiveCombinedStatus;
  terrain: ArchiveCombinedStatus;
  satellite: ArchiveCombinedStatus;
}

/**
 * The technical facts behind Settings → Data sources → "Copy technical
 * details". It reads the SAME archive-status hook the Offline maps cards
 * render, so a copied report can never disagree with what the panel showed.
 *
 * This replaced a scored "trail readiness" aggregate (an N/4 counter over
 * app-installed / app-shell / storage / basemap). That score was removed
 * rather than shrunk: it mixed delivery-mechanism diagnostics into what read
 * as trail preparation, it could not be satisfied on every platform, and
 * Offline maps already answers the only question a hiker actually has —
 * is the map data on this device. Nothing here is scored or ranked; these
 * are raw facts for a bug report.
 */
export function useOfflineDiagnostics(): OfflineDiagnostics {
  const { storageOk } = useStore();
  const swControlled = useServiceWorkerControlled();
  const basemap = useCombinedArchiveStatus([VECTOR_ARCHIVE]);
  const terrain = useCombinedArchiveStatus([TERRAIN_ARCHIVE, CONTOURS_ARCHIVE]);
  const satellite = useCombinedArchiveStatus([SATELLITE_ARCHIVE]);

  return { swControlled, storageOk, basemap, terrain, satellite };
}
