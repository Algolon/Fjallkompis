import { useStore } from '../store/AppStore';
import { useInstallPrompt } from './useInstallPrompt';
import { useServiceWorkerControlled } from '../components/InstallCard';
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

export interface TrailReadiness {
  /** Required checks passed (installed, storage, app shell, basemap). */
  passed: number;
  /** Number of required checks — the "/ 4" in "3 / 4 ready". */
  required: number;
  /** All required checks pass. */
  ready: boolean;
  /** Any archive probe still running (score not final yet). */
  pending: boolean;
  installed: boolean;
  swControlled: boolean;
  storageOk: boolean;
  basemap: ArchiveCombinedStatus;
  /** Optional extras — shown in Settings rows, never scored. */
  terrain: ArchiveCombinedStatus;
  satellite: ArchiveCombinedStatus;
}

/**
 * The ONE trail-readiness aggregate. Settings' Trail readiness accordion and
 * the Today Prepare card both read this hook, so the "N / 4" score can never
 * diverge between surfaces. The criteria are unchanged from the original
 * Settings card: required = installed, local storage, controlled app shell,
 * offline basemap; terrain/satellite/GPS stay optional and unscored.
 */
export function useTrailReadiness(): TrailReadiness {
  const { storageOk } = useStore();
  const { installed } = useInstallPrompt();
  const swControlled = useServiceWorkerControlled();
  const basemap = useCombinedArchiveStatus([VECTOR_ARCHIVE]);
  const terrain = useCombinedArchiveStatus([TERRAIN_ARCHIVE, CONTOURS_ARCHIVE]);
  const satellite = useCombinedArchiveStatus([SATELLITE_ARCHIVE]);

  const requiredChecks = [installed, storageOk, swControlled, basemap.downloaded];
  const passed = requiredChecks.filter(Boolean).length;
  const pending = basemap.checking || terrain.checking || satellite.checking;

  return {
    passed,
    required: requiredChecks.length,
    ready: passed === requiredChecks.length,
    pending,
    installed,
    swControlled,
    storageOk,
    basemap,
    terrain,
    satellite,
  };
}
