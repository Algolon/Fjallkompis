/**
 * Compact Map-screen layer control.
 *
 *  - Base map: Topographic / Satellite (mutually exclusive).
 *  - Independent overlay switches: hillshade, contours, labels.
 *  - Clear disabled states: an optional asset that has not shipped shows
 *    "Not yet available"; one that has shipped but is not downloaded shows
 *    "Download in Settings" and stays disabled until its data is present.
 *
 * The topographic base is always selectable — it is the dependable fallback
 * (streams online or shows the placeholder even before download).
 */
import { useEffect, useState } from 'react';
import type { BaseMapId, MapConfig } from '../map/mapConfig.mjs';
import type { OverlayKey } from '../hooks/useMapConfig';
import { baseAssets, listAssets, overlayAssets, type OfflineAsset } from '../map/assetRegistry.mjs';
import { getAssetStatus } from '../map/offlineAssets';

type AssetState = 'ready' | 'download-required' | 'unavailable';

const OVERLAY_KEY: Record<string, OverlayKey> = {
  contours: 'contoursEnabled',
  hillshade: 'hillshadeEnabled',
  labels: 'labelsEnabled',
};

interface Props {
  config: MapConfig;
  onSelectBase: (base: BaseMapId) => void;
  onToggleOverlay: (key: OverlayKey) => void;
}

function stateNote(state: AssetState): string | null {
  if (state === 'unavailable') return 'Not yet available';
  if (state === 'download-required') return 'Download in Settings';
  return null;
}

export function MapLayerControl({ config, onSelectBase, onToggleOverlay }: Props) {
  const [states, setStates] = useState<Record<string, AssetState>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      const entries = await Promise.all(
        listAssets().map(async (a): Promise<[string, AssetState]> => {
          if (!a.available) return [a.id, 'unavailable'];
          const status = await getAssetStatus(a);
          return [a.id, status.downloaded ? 'ready' : 'download-required'];
        }),
      );
      if (active) setStates(Object.fromEntries(entries));
    })();
    return () => {
      active = false;
    };
  }, []);

  const baseState = (a: OfflineAsset): AssetState =>
    // Topographic is always usable (online stream / placeholder fallback).
    a.id === 'topographic' ? 'ready' : (states[a.id] ?? 'unavailable');

  return (
    <div className="maplayers">
      <span className="maplayers-title">Map layers</span>

      {/* Base map — mutually exclusive */}
      <div className="maplayers-group" role="radiogroup" aria-label="Base map">
        <span className="maplayers-label">Base map</span>
        <div className="seg maplayers-seg">
          {baseAssets().map((a) => {
            const st = baseState(a);
            const disabled = st !== 'ready';
            const selected = config.baseMap === a.id;
            const note = stateNote(st);
            return (
              <button
                key={a.id}
                role="radio"
                aria-checked={selected}
                aria-disabled={disabled}
                disabled={disabled}
                className="seg-btn maplayers-base-btn"
                onClick={() => !disabled && onSelectBase(a.id as BaseMapId)}
              >
                <span>{a.label}</span>
                {note ? <span className="maplayers-tag">{note}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overlays — independent toggles */}
      <div className="maplayers-group">
        <span className="maplayers-label">Overlays</span>
        <ul className="maplayers-overlays">
          {overlayAssets().map((a) => {
            const st = states[a.id] ?? (a.available ? 'download-required' : 'unavailable');
            const disabled = st !== 'ready';
            const key = OVERLAY_KEY[a.id];
            const on = key ? config[key] : false;
            const note = stateNote(st);
            return (
              <li key={a.id} className="maplayers-row">
                <span className="maplayers-row-text">
                  <span className="maplayers-row-name">{a.label}</span>
                  {note ? <span className="maplayers-row-note">{note}</span> : null}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on && !disabled}
                  aria-label={`${a.label} overlay`}
                  aria-disabled={disabled}
                  disabled={disabled}
                  className={`switch ${on && !disabled ? 'is-on' : ''}`}
                  onClick={() => key && !disabled && onToggleOverlay(key)}
                >
                  <span className="switch-knob" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
