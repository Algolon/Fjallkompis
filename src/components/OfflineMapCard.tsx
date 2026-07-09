/**
 * Settings download management for a regional PMTiles archive. Used for both
 * the vector basemap and the optional satellite imagery — each file lives in
 * its own Cache Storage cache, separate from the Workbox app-shell precache
 * (see src/map/offlineMap.ts).
 */
import { useEffect, useState } from 'react';
import {
  archiveUrl,
  downloadArchive,
  formatBytes,
  getArchiveStatus,
  removeArchive,
  CONTOURS_ARCHIVE,
  SATELLITE_ARCHIVE,
  TERRAIN_ARCHIVE,
  VECTOR_ARCHIVE,
  type ArchiveSpec,
} from '../map/offlineMap';
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
  downloaded: boolean;
  sizeBytes: number | null;
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'idle'; status: CombinedStatus }
  | { kind: 'downloading'; loaded: number; total: number | null }
  | { kind: 'done'; sizeBytes: number }
  | { kind: 'error'; message: string };

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
}

function ArchiveCard({
  specs,
  title,
  description,
  removeConfirm,
  sourceHeading,
  source,
}: ArchiveCardProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  const refresh = async () => {
    const statuses = await Promise.all(specs.map((s) => getArchiveStatus(s)));
    setPhase({
      kind: 'idle',
      status: {
        supported: statuses.every((s) => s.supported),
        // Partial downloads (e.g. an aborted two-file fetch) count as not
        // downloaded, so the primary button offers to complete the set.
        downloaded: statuses.every((s) => s.downloaded),
        sizeBytes: statuses.every((s) => s.sizeBytes != null)
          ? statuses.reduce((sum, s) => sum + (s.sizeBytes ?? 0), 0)
          : null,
      },
    });
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs.map((s) => s.cacheName).join('|')]);

  const download = async () => {
    setPhase({ kind: 'downloading', loaded: 0, total: null });
    try {
      // Sequential download with combined progress. The total is only shown
      // once every file has reported a Content-Length.
      let doneBytes = 0;
      let totalKnown: number[] = [];
      let size = 0;
      for (const [i, spec] of specs.entries()) {
        const fileSize = await downloadArchive(spec, (loaded, total) => {
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
      setPhase({
        kind: 'error',
        message:
          e instanceof Error && e.message
            ? `${e.message} — check your connection and try again.`
            : 'Download failed — check your connection and try again.',
      });
    }
  };

  const remove = async () => {
    if (confirm(removeConfirm)) {
      for (const spec of specs) await removeArchive(spec);
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

  return (
    <div className="card">
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
            : downloaded
              ? '✓ Stored on this device'
              : 'Not downloaded'}
        </span>
      </div>
      <div className="row-between" style={{ marginTop: 8 }}>
        <span className="muted">File size</span>
        <span className="tnum">
          {phase.kind === 'downloading'
            ? `${formatBytes(phase.loaded)}${phase.total ? ` / ${formatBytes(phase.total)}` : ''}`
            : formatBytes(sizeBytes)}
        </span>
      </div>

      {phase.kind === 'downloading' ? (
        <progress
          className="map-progress"
          style={{ width: '100%', marginTop: 12 }}
          value={phase.total ? phase.loaded : undefined}
          max={phase.total ?? undefined}
          aria-label={`${title} download progress`}
        />
      ) : null}

      {phase.kind === 'done' ? (
        <p className="banner-warn" style={{ marginTop: 12, background: '#dfe9db', borderColor: '#c4d4be', color: '#46603f' }}>
          <span>✓</span>
          <span>Saved ({formatBytes(phase.sizeBytes)}). It now works without a connection.</span>
        </p>
      ) : null}

      {phase.kind === 'error' ? (
        <p className="banner-warn" style={{ marginTop: 12 }}>
          <span>⚠️</span>
          <span>{phase.message}</span>
        </p>
      ) : null}

      {downloaded ? (
        <>
          {/* While downloading, `downloaded` is false and the primary
              button below renders instead, so no disabled state is needed. */}
          <button className="btn btn-block" style={{ marginTop: 12 }} onClick={download}>
            Re-download / update
          </button>
          <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={remove}>
            Remove from device
          </button>
        </>
      ) : (
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 12 }}
          onClick={download}
          disabled={phase.kind === 'downloading' || phase.kind === 'checking'}
        >
          {phase.kind === 'downloading' ? 'Downloading…' : 'Download for offline use'}
        </button>
      )}

      <SourceSummary heading={sourceHeading} source={source} assetUrl={archiveUrl(specs[0])} />
    </div>
  );
}

export function OfflineMapCard() {
  return (
    <ArchiveCard
      specs={[VECTOR_ARCHIVE]}
      title="Offline map"
      description="A bounded OpenStreetMap-derived basemap of the Kungsleden area (Abisko–Nikkaluokta + ~9 km). Download it while online; the route itself always works offline."
      removeConfirm="Remove the offline map? The map screen will need a connection again."
      sourceHeading="Map data"
      source={BASEMAP_SOURCE_INFO}
    />
  );
}

export function TerrainReliefCard() {
  return (
    <ArchiveCard
      specs={[TERRAIN_ARCHIVE, CONTOURS_ARCHIVE]}
      title="Terrain relief"
      description="Hillshade and 20 m contour lines for the Kungsleden area, derived from the Copernicus elevation model (~15 MB, two files downloaded together). Download while online to keep the relief working offline, like the basemap."
      removeConfirm="Remove the terrain relief? The map will render without hillshade and contour lines."
      sourceHeading="Elevation data"
      source={TERRAIN_SOURCE_INFO}
    />
  );
}

export function SatelliteMapCard() {
  return (
    <ArchiveCard
      specs={[SATELLITE_ARCHIVE]}
      title="Satellite imagery"
      description="Sentinel-2 cloudless imagery (EOX) of the Kungsleden area, an optional second map layer (~42 MB, hosted separately). Download it while online to use Satellite fully offline, like the basemap."
      removeConfirm="Remove the satellite imagery? The Satellite map layer will be disabled."
      sourceHeading="Imagery"
      source={SATELLITE_SOURCE_INFO}
    />
  );
}

