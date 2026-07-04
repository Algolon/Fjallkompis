/**
 * Reusable offline-asset download card (Settings).
 *
 * Drives ANY registry asset (topographic base, satellite base, contours, …)
 * through the generic download-management model in src/map/offlineAssets.ts.
 * Each archive lives in its own dedicated Cache Storage cache, never the
 * Workbox app-shell precache.
 *
 * An asset whose PMTiles has not shipped yet (`available === false`) renders a
 * clear "not yet available" state with no dead download button.
 */
import { useEffect, useState } from 'react';
import type { OfflineAsset } from '../map/assetRegistry.mjs';
import {
  assetUrl,
  downloadAsset,
  formatBytes,
  getAssetStatus,
  removeAsset,
  type AssetStatus,
} from '../map/offlineAssets';

type Phase =
  | { kind: 'checking' }
  | { kind: 'idle'; status: AssetStatus }
  | { kind: 'downloading'; loaded: number; total: number | null }
  | { kind: 'done'; sizeBytes: number }
  | { kind: 'error'; message: string };

export function OfflineAssetCard({ asset }: { asset: OfflineAsset }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  const refresh = async () => {
    setPhase({ kind: 'idle', status: await getAssetStatus(asset) });
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);

  const download = async () => {
    setPhase({ kind: 'downloading', loaded: 0, total: null });
    try {
      const size = await downloadAsset(asset, (loaded, total) =>
        setPhase({ kind: 'downloading', loaded, total }),
      );
      setPhase({ kind: 'done', sizeBytes: size });
    } catch (e) {
      setPhase({
        kind: 'error',
        message:
          e instanceof Error && e.message
            ? `${e.message}. Try again.`
            : 'Download failed — check your connection and try again.',
      });
    }
  };

  const remove = async () => {
    if (confirm(`Remove the ${asset.label.toLowerCase()} download? You can re-download it later.`)) {
      await removeAsset(asset);
      await refresh();
    }
  };

  const downloaded = phase.kind === 'done' || (phase.kind === 'idle' && phase.status.downloaded);
  const sizeBytes =
    phase.kind === 'done'
      ? phase.sizeBytes
      : phase.kind === 'idle'
        ? phase.status.sizeBytes
        : null;

  const expected = `${asset.estimatedSize ? '≈' : ''}${formatBytes(asset.expectedSizeBytes)}`;

  return (
    <div className="card">
      <div className="row-between">
        <span className="card-title">
          {asset.label}
          {asset.required ? <span className="pill" style={{ marginLeft: 8 }}>Fallback</span> : null}
        </span>
        {asset.streamed ? (
          <span className="pill">Online</span>
        ) : !asset.available ? (
          <span className="pill">Planned</span>
        ) : null}
      </div>
      <p className="card-sub" style={{ marginTop: 4 }}>
        {asset.description}
      </p>

      {asset.streamed ? (
        <>
          <p className="banner-warn" style={{ marginTop: 12, background: 'var(--glacier-soft)', borderColor: '#bcd3d8', color: 'var(--glacier-700)' }}>
            <span>🛰️</span>
            <span>Streams while you have a connection — no download, nothing stored. Switch to it from Map → Layers.</span>
          </p>
          <p className="card-sub" style={{ marginTop: 10 }}>
            Attribution: <span dangerouslySetInnerHTML={{ __html: asset.attribution }} />
          </p>
        </>
      ) : !asset.available ? (
        <>
          <div className="row-between" style={{ marginTop: 12 }}>
            <span className="muted">Estimated size</span>
            <span className="tnum">{expected}</span>
          </div>
          <p className="banner-warn" style={{ marginTop: 12 }}>
            <span>🧭</span>
            <span>
              Planned — not yet available to download. See the layered-offline-map
              docs for the source, licence and build pipeline.
            </span>
          </p>
          <p className="card-sub" style={{ marginTop: 10 }}>
            Attribution: {asset.attribution}
          </p>
        </>
      ) : (
        <>
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
            <span className="muted">{downloaded ? 'File size' : 'Approx. size'}</span>
            <span className="tnum">
              {phase.kind === 'downloading'
                ? `${formatBytes(phase.loaded)}${phase.total ? ` / ${formatBytes(phase.total)}` : ''}`
                : downloaded
                  ? formatBytes(sizeBytes)
                  : expected}
            </span>
          </div>

          {phase.kind === 'downloading' ? (
            <progress
              className="map-progress"
              style={{ width: '100%', marginTop: 12 }}
              value={phase.total ? phase.loaded : undefined}
              max={phase.total ?? undefined}
              aria-label={`${asset.label} download progress`}
            />
          ) : null}

          {phase.kind === 'done' ? (
            <p
              className="banner-warn"
              style={{ marginTop: 12, background: '#dfe9db', borderColor: '#c4d4be', color: '#46603f' }}
            >
              <span>✓</span>
              <span>Saved ({formatBytes(phase.sizeBytes)}).</span>
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
              <button className="btn btn-block" style={{ marginTop: 12 }} onClick={download}>
                Re-download / update
              </button>
              <button
                className="btn btn-danger btn-block"
                style={{ marginTop: 10 }}
                onClick={remove}
              >
                Remove download
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

          <p className="card-sub" style={{ marginTop: 10 }}>
            Attribution: {asset.attribution}
          </p>
          <p className="card-sub" style={{ marginTop: 6, wordBreak: 'break-all' }}>
            Source: {assetUrl(asset)}
          </p>
        </>
      )}
    </div>
  );
}
