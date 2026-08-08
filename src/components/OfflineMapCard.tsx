/**
 * Settings download management for the offline map archives — the basemap,
 * terrain relief and satellite imagery.
 *
 * ONE card implementation, both platforms. Where the bytes are kept is the
 * platform's business and lives behind src/map/archiveStore.ts: Cache Storage
 * in a browser, app-private files on Android, the app package for an archive
 * that ships inside it. This component only ever asks the store what the
 * device holds, and every state it renders — not downloaded, downloading,
 * stored, update available, needs repair, included in the app — means the same
 * thing in both places.
 */
import { useEffect, useState } from 'react';
import {
  archiveStatus,
  cancelArchiveDownload,
  downloadArchiveToDevice,
  removeArchiveFromDevice,
  type StoredArchiveState,
  type StoredArchiveStatus,
} from '../map/archiveStore';
import {
  archiveUrl,
  ARCHIVE_MISMATCH_ERROR,
  formatBytes,
  CONTOURS_ARCHIVE,
  SATELLITE_ARCHIVE,
  TERRAIN_ARCHIVE,
  VECTOR_ARCHIVE,
  type ArchiveSpec,
} from '../map/offlineMap';
import { mapAssetGroupBytes } from '../map/mapCatalog.mjs';
import { ARCHIVE_CANCELLED_ERROR } from '../map/nativeArchiveStore';
import {
  BASEMAP_SOURCE_INFO,
  SATELLITE_SOURCE_INFO,
  TERRAIN_SOURCE_INFO,
  type DataSourceAttribution,
} from '../data/attribution';
import { SourceSummary } from './SourceSummary';

/** Combined download state of a card's archives (usually one; relief: two). */
interface CombinedStatus {
  supported: boolean;
  /** A USABLE archive is stored — current, a shipped superseded one, or bundled. */
  downloaded: boolean;
  sizeBytes: number | null;
  /** 'legacy' when a superseded revision is in use; 'invalid' when unusable. */
  state: StoredArchiveState;
  /** Bytes the replacement download will store. */
  expectedBytes: number | null;
  updateAvailable: boolean;
  needsRepair: boolean;
  /** Every archive in this group ships with the app — nothing to manage. */
  bundled: boolean;
  /** The store can interrupt an in-flight download (native only). */
  cancellable: boolean;
}

export type ArchiveCombinedStatus = CombinedStatus & { checking: boolean };

type Phase =
  | { kind: 'checking' }
  | { kind: 'idle'; status: CombinedStatus }
  | { kind: 'downloading'; loaded: number; total: number | null }
  | { kind: 'done'; sizeBytes: number };

/**
 * Fold per-archive statuses into the one state a card shows. A card is only up
 * to date when every archive it manages is. Unusable data wins over everything
 * — it is the one state that needs the user to act — then anything missing
 * reads as not downloaded (the primary button offers to complete the set), and
 * anything superseded reads as an update. Never as current.
 *
 * `bundled` only survives the fold when EVERY archive in the group is bundled,
 * so a hypothetical mixed group would present as an ordinary download rather
 * than claiming to be complete because half of it ships with the app.
 */
function combineStatuses(statuses: StoredArchiveStatus[]): CombinedStatus {
  const downloaded = statuses.every((s) => s.downloaded);
  const bundled = statuses.length > 0 && statuses.every((s) => s.state === 'bundled');
  const state: StoredArchiveState = statuses.some((s) => s.state === 'invalid')
    ? 'invalid'
    : !downloaded
      ? 'absent'
      : statuses.some((s) => s.state === 'legacy')
        ? 'legacy'
        : bundled
          ? 'bundled'
          : 'current';
  return {
    supported: statuses.every((s) => s.supported),
    downloaded,
    sizeBytes: statuses.every((s) => s.sizeBytes != null)
      ? statuses.reduce((sum, s) => sum + (s.sizeBytes ?? 0), 0)
      : null,
    state,
    expectedBytes: statuses.every((s) => s.expectedBytes != null)
      ? statuses.reduce((sum, s) => sum + (s.expectedBytes ?? 0), 0)
      : null,
    updateAvailable: state === 'legacy',
    needsRepair: state === 'invalid',
    bundled,
    cancellable: statuses.every((s) => s.cancellable),
  };
}

interface ArchiveCardProps {
  /**
   * The archives this card manages as ONE user-facing download. Usually a
   * single file; the Terrain relief card bundles the terrain-RGB and
   * contour archives because neither is useful without the other.
   */
  specs: ArchiveSpec[];
  title: string;
  description: string;
  /** Confirmation text shown before removing the archive(s). */
  removeConfirm: string;
  /** Heading of the source/attribution block, e.g. "Map data" or "Imagery". */
  sourceHeading: string;
  /** Attribution entry from the central registry (src/data/attribution.ts). */
  source: DataSourceAttribution;
  /** Render only the card contents when nested inside another framed control. */
  embedded?: boolean;
}

export function useCombinedArchiveStatus(specs: ArchiveSpec[]): ArchiveCombinedStatus {
  const [status, setStatus] = useState<ArchiveCombinedStatus>({
    checking: true,
    supported: false,
    downloaded: false,
    sizeBytes: null,
    state: 'absent',
    expectedBytes: null,
    updateAvailable: false,
    needsRepair: false,
    bundled: false,
    cancellable: false,
  });

  useEffect(() => {
    let alive = true;
    void Promise.all(specs.map((s) => archiveStatus(s))).then((statuses) => {
      if (!alive) return;
      setStatus({ checking: false, ...combineStatuses(statuses) });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs.map((s) => s.cacheName).join('|')]);

  return status;
}

function ArchiveCard({
  specs,
  title,
  description,
  removeConfirm,
  sourceHeading,
  source,
  embedded = false,
}: ArchiveCardProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  // Held apart from `phase` on purpose: a failed download must not erase what
  // the device still has. After an error the card falls back to the real
  // status — for a superseded archive that is "update available", never
  // "not downloaded".
  const [error, setError] = useState<string | null>(null);
  // Whether the store can interrupt a download, remembered across the
  // downloading phase (where there is no status to read it from).
  const [cancellable, setCancellable] = useState(false);

  const refresh = async () => {
    const statuses = await Promise.all(specs.map((s) => archiveStatus(s)));
    const status = combineStatuses(statuses);
    setCancellable(status.cancellable);
    setPhase({ kind: 'idle', status });
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs.map((s) => s.cacheName).join('|')]);

  const download = async () => {
    setError(null);
    setPhase({ kind: 'downloading', loaded: 0, total: null });
    try {
      // Sequential download with combined progress. The total is only shown
      // once every file has reported a Content-Length.
      let doneBytes = 0;
      let totalKnown: number[] = [];
      let size = 0;
      for (const [i, spec] of specs.entries()) {
        const fileSize = await downloadArchiveToDevice(spec, (loaded, total) => {
          if (total != null) totalKnown[i] = total;
          const combinedTotal =
            totalKnown.filter((t) => t != null).length === specs.length
              ? totalKnown.reduce((a, b) => a + b, 0)
              : null;
          setPhase({ kind: 'downloading', loaded: doneBytes + loaded, total: combinedTotal });
        });
        doneBytes += fileSize;
        size += fileSize;
      }
      setPhase({ kind: 'done', sizeBytes: size });
    } catch (e) {
      setError(
        // Stopping the download yourself is not a failure to report.
        e instanceof Error && e.name === ARCHIVE_CANCELLED_ERROR
          ? null
          : // A rejected archive arrived intact — its message is already the
            // whole story, and "check your connection" would be wrong advice.
            e instanceof Error && e.name === ARCHIVE_MISMATCH_ERROR
            ? e.message
            : e instanceof Error && e.message
              ? `${e.message} — check your connection and try again.`
              : 'Download failed — check your connection and try again.',
      );
      // Re-read what is stored rather than assuming: nothing was replaced, so
      // the previously stored archive is still there and still usable offline.
      await refresh();
    }
  };

  /**
   * Stop an in-flight download. Only the native store can interrupt one; in a
   * browser the fetch runs to completion and this button is not offered.
   */
  const cancel = async () => {
    for (const spec of specs) await cancelArchiveDownload(spec);
  };

  const remove = async () => {
    if (confirm(removeConfirm)) {
      for (const spec of specs) await removeArchiveFromDevice(spec);
      setError(null);
      await refresh();
    }
  };

  const downloaded =
    phase.kind === 'done' || (phase.kind === 'idle' && phase.status.downloaded);
  const sizeBytes =
    phase.kind === 'done'
      ? phase.sizeBytes
      : phase.kind === 'idle'
        ? phase.status.sizeBytes
        : null;
  // A completed download is current by construction — both stores refuse to
  // keep an archive that fails its revision contract.
  const updateAvailable = phase.kind === 'idle' && phase.status.updateAvailable;
  const needsRepair = phase.kind === 'idle' && phase.status.needsRepair;
  const expectedBytes = phase.kind === 'idle' ? phase.status.expectedBytes : null;
  /**
   * Shipped inside the app package. There is no download to start and nothing
   * to reclaim by removing it, so the card states the fact and offers no
   * controls — the same card, one state further along, not a platform fork.
   */
  const bundled = phase.kind === 'idle' && phase.status.bundled;

  const content = (
    <>
      <span className="card-title">{title}</span>
      <p className="card-sub" style={{ marginTop: 4 }}>
        {description}
      </p>

      {phase.kind === 'checking' ? (
        <p className="card-sub" style={{ marginTop: 12 }}>
          Checking…
        </p>
      ) : null}

      {phase.kind === 'idle' && !phase.status.supported ? (
        <p className="banner-warn" style={{ marginTop: 12 }}>
          <span>⚠️</span>
          <span>This browser does not support offline storage (Cache Storage API).</span>
        </p>
      ) : null}

      <div className="row-between" style={{ marginTop: 12 }}>
        <span className="muted">Status</span>
        <span>
          {phase.kind === 'downloading'
            ? 'Downloading…'
            : needsRepair
              ? // "Map data needs repair" for the basemap; the heading keeps
                // the wording right for any other card that gains a revision.
                `${sourceHeading} needs repair`
              : updateAvailable
                ? 'Map update available'
                : bundled
                  ? '✓ Included in the app'
                  : downloaded
                    ? '✓ Stored on this device'
                    : 'Not downloaded'}
        </span>
      </div>
      <div className="row-between" style={{ marginTop: 8 }}>
        <span className="muted">
          {updateAvailable || needsRepair ? 'Stored now' : 'File size'}
        </span>
        <span className="tnum">
          {phase.kind === 'downloading'
            ? `${formatBytes(phase.loaded)}${phase.total ? ` / ${formatBytes(phase.total)}` : ''}`
            : formatBytes(sizeBytes)}
        </span>
      </div>
      {(updateAvailable || needsRepair) && expectedBytes != null ? (
        <div className="row-between" style={{ marginTop: 8 }}>
          <span className="muted">{needsRepair ? 'Expected size' : 'Update size'}</span>
          <span className="tnum">{formatBytes(expectedBytes)}</span>
        </div>
      ) : null}

      {phase.kind === 'downloading' ? (
        <progress
          className="map-progress"
          style={{ width: '100%', marginTop: 12 }}
          value={phase.total ? phase.loaded : undefined}
          max={phase.total ?? undefined}
          aria-label={`${title} download progress`}
        />
      ) : null}

      {bundled ? (
        <p className="banner-info" style={{ marginTop: 12 }}>
          <span aria-hidden>✓</span>
          <span>
            This map is part of the app, so it is ready the moment you install
            it and works with no connection. There is nothing to download and
            nothing to remove.
          </span>
        </p>
      ) : null}

      {phase.kind === 'done' ? (
        <p className="banner-warn" style={{ marginTop: 12, background: '#dfe9db', borderColor: '#c4d4be', color: '#46603f' }}>
          <span>✓</span>
          <span>Saved ({formatBytes(phase.sizeBytes)}). It now works without a connection.</span>
        </p>
      ) : null}

      {updateAvailable ? (
        <p className="banner-info" style={{ marginTop: 12 }}>
          <span aria-hidden>↻</span>
          <span>
            The map on this device still works offline. A newer map-data
            package is available; updating downloads it first and replaces the
            old one only once it has arrived.
          </span>
        </p>
      ) : null}

      {needsRepair ? (
        <p className="banner-info" style={{ marginTop: 12 }}>
          <span aria-hidden>↻</span>
          <span>
            The stored map data is incomplete, so it is not being used —
            downloading it again replaces it. Until then the map needs a
            connection.
          </span>
        </p>
      ) : null}

      {error ? (
        <p className="banner-warn" style={{ marginTop: 12 }}>
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      ) : null}

      {bundled ? null : needsRepair ? (
        <>
          {/* Not "Download for offline use": there IS data here, it just
              cannot be used. Remove stays available so the unusable bytes can
              be cleared without downloading first. */}
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 }}
            onClick={download}
          >
            Download map data again
          </button>
          <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={remove}>
            Remove from device
          </button>
        </>
      ) : downloaded ? (
        <>
          {/* While downloading, `downloaded` is false and the primary
              button below renders instead, so no disabled state is needed. */}
          <button
            className={`btn btn-block ${updateAvailable ? 'btn-primary' : ''}`}
            style={{ marginTop: 12 }}
            onClick={download}
          >
            {updateAvailable ? 'Update map data' : 'Re-download / update'}
          </button>
          <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={remove}>
            Remove from device
          </button>
        </>
      ) : (
        <>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 }}
            onClick={download}
            disabled={phase.kind === 'downloading' || phase.kind === 'checking'}
          >
            {phase.kind === 'downloading' ? 'Downloading…' : 'Download for offline use'}
          </button>
          {/* Only where the store can actually interrupt the transfer. A
              browser download assembles one Blob and either completes or
              throws, so a Cancel button there would be a lie. */}
          {phase.kind === 'downloading' && cancellable ? (
            <button className="btn btn-block" style={{ marginTop: 10 }} onClick={cancel}>
              Cancel download
            </button>
          ) : null}
        </>
      )}

      <SourceSummary heading={sourceHeading} source={source} assetUrls={specs.map(archiveUrl)} />
    </>
  );

  return embedded ? content : <div className="card">{content}</div>;
}

export function OfflineMapCard({ embedded = false }: { embedded?: boolean }) {
  return (
    <ArchiveCard
      specs={[VECTOR_ARCHIVE]}
      title="Offline map"
      description="A bounded OpenStreetMap-derived basemap of the Kungsleden area (Abisko–Nikkaluokta + ~12 km of surrounding terrain). Download it while online; the route itself always works offline."
      removeConfirm="Remove the offline map? The map screen will need a connection again."
      sourceHeading="Map data"
      source={BASEMAP_SOURCE_INFO}
      embedded={embedded}
    />
  );
}

export function TerrainReliefCard({ embedded = false }: { embedded?: boolean }) {
  return (
    <ArchiveCard
      specs={[TERRAIN_ARCHIVE, CONTOURS_ARCHIVE]}
      title="Terrain relief"
      // The size is derived from the catalog, not typed in: a stale "~25 MB"
      // against a 27 MB download is exactly the kind of small lie that erodes
      // trust in a screen whose whole job is telling you what you have.
      description={`Hillshade and 20 m contour lines for the Kungsleden area, derived from the Copernicus elevation model (${formatBytes(mapAssetGroupBytes(['terrain', 'contours']))}, two files downloaded together). Download it while you have a connection — relief is only drawn from the copy on your device, so nothing large is ever fetched on the trail.`}
      removeConfirm="Remove the terrain relief? The map will render without hillshade and contour lines."
      sourceHeading="Elevation data"
      source={TERRAIN_SOURCE_INFO}
      embedded={embedded}
    />
  );
}

export function SatelliteMapCard({ embedded = false }: { embedded?: boolean }) {
  return (
    <ArchiveCard
      specs={[SATELLITE_ARCHIVE]}
      title="Satellite imagery"
      description={`Sentinel-2 cloudless imagery (EOX) of the Kungsleden area, an optional second map layer (${formatBytes(mapAssetGroupBytes(['satellite']))}). Download it while you have a connection — the Satellite layer stays switched off until it is on your device, so this much data is never fetched unexpectedly.`}
      removeConfirm="Remove the satellite imagery? The Satellite map layer will be disabled."
      sourceHeading="Imagery"
      source={SATELLITE_SOURCE_INFO}
      embedded={embedded}
    />
  );
}

export {
  CONTOURS_ARCHIVE,
  SATELLITE_ARCHIVE,
  TERRAIN_ARCHIVE,
  VECTOR_ARCHIVE,
  formatBytes,
};
