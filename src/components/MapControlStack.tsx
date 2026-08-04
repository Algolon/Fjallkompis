/**
 * Map control stack — the compact column of map actions on the top-right
 * edge of the workspace: basemap layer, fit the current scope, one-shot
 * locate, and follow mode once a position exists.
 *
 * Rules these controls follow:
 *  - every target is at least 44×44 px;
 *  - state reads from shape, icon and text (the accessible name always says
 *    what the control does and what state it is in), never from colour;
 *  - the paper-glass surface keeps essential contrast independent of the
 *    terrain or satellite imagery underneath;
 *  - no permanent zoom buttons on touch: pinch is the gesture, and
 *    MapLibre's own navigation control is added only for fine pointers
 *    (see MapView).
 *
 * The satellite/terrain choice lives in a small sheet rather than a
 * permanent segmented control: on a phone the map is the workspace, and an
 * unavailable satellite layer is explained there instead of in a banner
 * that eats the map all trip long.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Crosshair, Image, Maximize, Mountain, Navigation } from 'lucide-react';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import type { ImageryMode } from './MapView';

export function MapControlStack({
  stackRef,
  imagery,
  onImageryChange,
  satelliteAvailable,
  basemapAvailable,
  fitLabel,
  onFit,
  onLocate,
  locateDisabled,
  locating,
  follow,
  onToggleFollow,
  canFollow,
}: {
  /** Measured by MapScreen for the camera's right padding. */
  stackRef?: RefObject<HTMLDivElement>;
  imagery: ImageryMode;
  onImageryChange: (mode: ImageryMode) => void;
  satelliteAvailable: boolean;
  basemapAvailable: boolean;
  /** "Fit route" / "Fit Day 3" — the accessible name of the fit action. */
  fitLabel: string;
  onFit: () => void;
  onLocate: () => void;
  locateDisabled: boolean;
  locating: boolean;
  follow: boolean;
  onToggleFollow: () => void;
  canFollow: boolean;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const layersRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="map-controls" role="group" aria-label="Map controls" ref={stackRef}>
      <button
        ref={layersRef}
        type="button"
        className="map-ctrl"
        aria-haspopup="dialog"
        aria-expanded={layersOpen}
        aria-label={`Map layer: ${imagery === 'satellite' ? 'Satellite' : 'Terrain'}`}
        onClick={() => setLayersOpen(true)}
      >
        {/* The ICON carries the current layer (a summit for the terrain
            basemap, a photo frame for satellite imagery) — state never rests
            on colour, and the accessible name always spells it out. */}
        {imagery === 'satellite' ? (
          <Image size={20} strokeWidth={1.9} aria-hidden />
        ) : (
          <Mountain size={20} strokeWidth={1.9} aria-hidden />
        )}
      </button>

      <button type="button" className="map-ctrl" aria-label={fitLabel} onClick={onFit}>
        <Maximize size={20} strokeWidth={1.9} aria-hidden />
      </button>

      <button
        type="button"
        className="map-ctrl"
        aria-label={locating ? 'Locating your position' : 'Locate me'}
        aria-busy={locating}
        disabled={locateDisabled}
        onClick={onLocate}
      >
        <Crosshair size={20} strokeWidth={1.9} aria-hidden />
      </button>

      {canFollow ? (
        <button
          type="button"
          className={`map-ctrl${follow ? ' is-on' : ''}`}
          aria-pressed={follow}
          aria-label="Follow my position"
          onClick={onToggleFollow}
        >
          <Navigation size={19} strokeWidth={1.9} aria-hidden />
          <span className="map-ctrl__caption">{follow ? 'On' : 'Off'}</span>
        </button>
      ) : null}

      {layersOpen ? (
        <LayerSheet
          imagery={imagery}
          onImageryChange={onImageryChange}
          satelliteAvailable={satelliteAvailable}
          basemapAvailable={basemapAvailable}
          onClose={() => {
            setLayersOpen(false);
            layersRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function LayerSheet({
  imagery,
  onImageryChange,
  satelliteAvailable,
  basemapAvailable,
  onClose,
}: {
  imagery: ImageryMode;
  onImageryChange: (mode: ImageryMode) => void;
  satelliteAvailable: boolean;
  basemapAvailable: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet map-layer-sheet"
      aria-labelledby="map-layer-title"
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2 id="map-layer-title">Map layer</h2>
          <button className="link-btn" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>

        <div className="layer-list" role="radiogroup" aria-label="Basemap imagery">
          <button
            type="button"
            role="radio"
            aria-checked={imagery === 'terrain'}
            className="layer-option"
            onClick={() => {
              onImageryChange('terrain');
              ref.current?.close();
            }}
          >
            <span className="layer-option__name">Terrain</span>
            <span className="layer-option__note">
              The offline Nordic basemap: relief, contours and the route.
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={imagery === 'satellite'}
            className="layer-option"
            disabled={!satelliteAvailable}
            onClick={() => {
              onImageryChange('satellite');
              ref.current?.close();
            }}
          >
            <span className="layer-option__name">
              Satellite
              {!satelliteAvailable ? (
                <span className="pill layer-option__state">Not downloaded</span>
              ) : null}
            </span>
            <span className="layer-option__note">
              {satelliteAvailable
                ? 'Offline Sentinel-2 imagery for the route corridor.'
                : 'Download it in Settings → Satellite imagery to use this layer offline.'}
            </span>
          </button>
        </div>

        {!basemapAvailable ? (
          <p className="banner-warn" style={{ marginTop: 14 }}>
            <span aria-hidden>🗺️</span>
            <span>
              The offline basemap isn’t on this device, so the route is drawn on a
              plain background. Download it in Settings while you have a
              connection.
            </span>
          </p>
        ) : null}
      </div>
    </dialog>
  );
}
