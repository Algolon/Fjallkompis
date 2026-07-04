/**
 * Compact Map-screen layer control.
 *
 * Collapsed by default: a single "Layers" button showing the active base map.
 * Expanding reveals a disclosure panel that lists ONLY the layers the user can
 * actually use right now — base maps and overlays whose asset is available.
 * Planned assets (satellite, contours, hillshade, labels) are intentionally
 * absent here; they live in Settings as "Planned" until produced.
 *
 * The panel sits below the map, so it never obscures the route, hut markers,
 * GPS position, attribution or the MapLibre controls.
 */
import { useState } from 'react';
import type { BaseMapId, MapConfig } from '../map/mapConfig.mjs';
import { baseAssets, overlayAssets } from '../map/assetRegistry.mjs';
import type { OverlayKey } from '../hooks/useMapConfig';
import { IconLayers } from './Icons';

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

export function MapLayerControl({ config, onSelectBase, onToggleOverlay }: Props) {
  const [open, setOpen] = useState(false);

  // Only surface layers that genuinely exist to use now.
  const bases = baseAssets().filter((a) => a.available);
  const overlays = overlayAssets().filter((a) => a.available);

  const activeBase = bases.find((a) => a.id === config.baseMap) ?? bases[0];

  return (
    <div className="maplayers">
      <button
        type="button"
        className="maplayers-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="maplayers-toggle-main">
          <IconLayers className="maplayers-toggle-icon" />
          Layers
        </span>
        <span className="maplayers-toggle-summary">
          {activeBase?.label ?? '—'}
          <span className="maplayers-chevron" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>

      {open ? (
        <div className="maplayers-panel">
          <div className="maplayers-group" role="radiogroup" aria-label="Base map">
            <span className="maplayers-label">Base map</span>
            {bases.length > 1 ? (
              <div className="seg maplayers-seg">
                {bases.map((a) => (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={config.baseMap === a.id}
                    className="seg-btn maplayers-base-btn"
                    onClick={() => onSelectBase(a.id as BaseMapId)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            ) : (
              // A single base map is not a choice — show it as the current base.
              <p className="maplayers-single">{activeBase?.label ?? 'Topographic'}</p>
            )}
          </div>

          {overlays.length > 0 ? (
            <div className="maplayers-group">
              <span className="maplayers-label">Overlays</span>
              <ul className="maplayers-overlays">
                {overlays.map((a) => {
                  const key = OVERLAY_KEY[a.id];
                  const on = key ? config[key] : false;
                  return (
                    <li key={a.id} className="maplayers-row">
                      <span className="maplayers-row-name">{a.label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${a.label} overlay`}
                        className={`switch ${on ? 'is-on' : ''}`}
                        onClick={() => key && onToggleOverlay(key)}
                      >
                        <span className="switch-knob" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
