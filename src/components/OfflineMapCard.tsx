/**
 * Settings → "Offline map": explicit download management for the regional
 * PMTiles basemap. The file lives in its own Cache Storage cache, separate
 * from the Workbox app-shell precache (see src/map/offlineMap.ts).
 */
import { useEffect, useState } from 'react';
import {
  downloadOfflineMap,
  formatBytes,
  getOfflineMapStatus,
  offlineMapUrl,
  removeOfflineMap,
  type OfflineMapStatus,
} from '../map/offlineMap';

type Phase =
  | { kind: 'checking' }
  | { kind: 'idle'; status: OfflineMapStatus }
  | { kind: 'downloading'; loaded: number; total: number | null }
  | { kind: 'done'; sizeBytes: number }
  | { kind: 'error'; message: string };

export function OfflineMapCard() {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  const refresh = async () => {
    setPhase({ kind: 'idle', status: await getOfflineMapStatus() });
  };

  useEffect(() => {
    void refresh();
  }, []);

  const download = async () => {
    setPhase({ kind: 'downloading', loaded: 0, total: null });
    try {
      const size = await downloadOfflineMap((loaded, total) =>
        setPhase({ kind: 'downloading', loaded, total }),
      );
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
    if (confirm('Remove the offline map? The map screen will need a connection again.')) {
      await removeOfflineMap();
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
      <span className="card-title">Offline map</span>
      <p className="card-sub" style={{ marginTop: 4 }}>
        A bounded OpenStreetMap-derived basemap of the Kungsleden area (Abisko–Nikkaluokta
        + ~9 km). Download it while online; the route itself always works offline.
      </p>

      {phase.kind === 'checking' ? (
        <p className="card-sub" style={{ marginTop: 12 }}>
          Checking offline map…
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
          aria-label="Map download progress"
        />
      ) : null}

      {phase.kind === 'done' ? (
        <p className="banner-warn" style={{ marginTop: 12, background: '#dfe9db', borderColor: '#c4d4be', color: '#46603f' }}>
          <span>✓</span>
          <span>Offline map saved ({formatBytes(phase.sizeBytes)}). The map now works without a connection.</span>
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
            Re-download / update map
          </button>
          <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={remove}>
            Remove offline map
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

      <p className="card-sub" style={{ marginTop: 10, wordBreak: 'break-all' }}>
        Source: {offlineMapUrl()}
      </p>
    </div>
  );
}
