import { useState } from 'react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { RouteMap } from '../components/RouteMap';
import { IconLocate } from '../components/Icons';
import { useGeolocation } from '../hooks/useGeolocation';
import { HUTS, HUTS_BY_ID } from '../data/huts';
import { haversineKm } from '../utils/geo';
import { formatDistanceKm } from '../utils/format';
import type { LatLng } from '../types';

export function MapScreen() {
  const { currentStage, nextHutId } = useStore();
  const geo = useGeolocation();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHutId, setManualHutId] = useState<string>(HUTS[0].id);

  const nextHut = nextHutId ? HUTS_BY_ID[nextHutId] : null;

  const distanceToNext: number | null =
    geo.coord && nextHut ? haversineKm(geo.coord, nextHut.coord) : null;

  const applyManual = () => {
    const hut = HUTS_BY_ID[manualHutId];
    if (hut) {
      // Manual mode: treat "I'm at hut X" as a stand-in for a GPS fix.
      const coord: LatLng = hut.coord;
      geo.setManual(coord);
      setManualOpen(false);
    }
  };

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Route" title="Map">
        A route-first offline map: the trail line, every hut, and your position.
      </ScreenHeader>

      <div className="banner-warn" style={{ marginBottom: 14 }}>
        <span>⚠️</span>
        <span>
          Prototype only — not for primary navigation. Coordinates are
          approximate prototype route data; replace with verified GPX before real
          use.
        </span>
      </div>

      <div className="card map-card">
        <RouteMap
          highlightStageId={currentStage?.id ?? null}
          gps={geo.coord}
          nextHutId={nextHutId}
        />
        <div className="map-legend">
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#9fb4ab' }} />
            Route
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#c98438' }} />
            Current stage
          </span>
          <span className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: '#2c7a8c', borderRadius: 999, width: 10, height: 10 }}
            />
            You
          </span>
        </div>
      </div>

      <div className="card">
        <button
          className="btn btn-glacier btn-block"
          onClick={geo.locate}
          disabled={geo.status === 'locating'}
        >
          <IconLocate />
          {geo.status === 'locating' ? 'Locating…' : 'Use my location'}
        </button>

        {geo.status === 'success' && geo.coord ? (
          <div style={{ marginTop: 14 }}>
            <div className="row-between">
              <span className="muted">Your position</span>
              <span className="tnum">
                {geo.coord.lat.toFixed(4)}, {geo.coord.lng.toFixed(4)}
              </span>
            </div>
            {geo.accuracyM != null ? (
              <div className="row-between" style={{ marginTop: 6 }}>
                <span className="muted">Fix accuracy</span>
                <span className="tnum">±{Math.round(geo.accuracyM)} m</span>
              </div>
            ) : null}
            {nextHut ? (
              <div className="row-between" style={{ marginTop: 6 }}>
                <span className="muted">Straight line to {nextHut.name}</span>
                <span className="tnum" style={{ fontWeight: 700 }}>
                  {distanceToNext != null ? formatDistanceKm(distanceToNext) : '—'}
                </span>
              </div>
            ) : (
              <p className="card-sub" style={{ marginTop: 8 }}>
                Set a current stage to see distance to your next hut.
              </p>
            )}
            <p className="card-sub" style={{ marginTop: 10 }}>
              Straight-line distance ignores terrain and detours — the real walk
              is always longer.
            </p>
          </div>
        ) : null}

        {geo.status === 'error' && geo.error ? (
          <p className="banner-warn" style={{ marginTop: 12 }}>
            <span>📍</span>
            <span>{geo.error}</span>
          </p>
        ) : null}

        {/* Manual mode fallback */}
        {geo.status === 'error' || geo.status === 'idle' ? (
          <div style={{ marginTop: 12 }}>
            {!manualOpen ? (
              <button
                className="btn btn-ghost btn-block"
                onClick={() => setManualOpen(true)}
              >
                Use manual mode instead
              </button>
            ) : (
              <div>
                <label className="field">
                  <span>I’m currently at</span>
                  <select
                    className="select"
                    value={manualHutId}
                    onChange={(e) => setManualHutId(e.target.value)}
                  >
                    {HUTS.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 12 }}
                  onClick={applyManual}
                >
                  Set position from hut
                </button>
                <p className="card-sub" style={{ marginTop: 8 }}>
                  Manual mode pins you to a hut so distances still work without
                  GPS.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
