/**
 * TEMPORARY dev-only Satellite A/B benchmark — v5 (canonical, z15/q80)
 * against the local v6 candidate (z16/q95) inside the REAL app map, with
 * the real route/hut/GPS overlays above the imagery.
 *
 * Isolation contract (tests/sat-benchmark-isolation.test.mjs):
 *  - reachable ONLY through MapView's `import.meta.env.DEV &&
 *    ?satBenchmark=1` gate, and only via dynamic import — production
 *    bundles contain none of this module;
 *  - touches NO catalog revision, NO offline storage or caches, NO
 *    attribution contract, NO Android path: both archives are read straight
 *    off the dev server (Vite serves public/maps with HTTP ranges) through
 *    ephemeral pmtiles:// hosted sources that are never stored;
 *  - the v6 candidate is a git-ignored local file
 *    (docs/operations/satellite-v6-z16-benchmark.md builds it); when it is
 *    absent the panel says so and the ordinary map is unaffected.
 *
 * Switching variants toggles LAYER VISIBILITY only — centre, zoom, bearing
 * and pitch are untouched, so A/B is pixel-for-pixel as fair as MapLibre
 * permits. Each source's min/max zoom comes from its own archive header via
 * the PMTiles TileJSON, so v5 keeps its native z15 + overzoom behaviour
 * while v6 renders native tiles through z16.
 */
import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import { ensurePmtilesProtocol } from './pmtilesProtocol';

interface BenchWaypoint {
  id: string;
  lat: number;
  lon: number;
}

type VariantId = 'A' | 'B';

const VARIANTS: Record<VariantId, { label: string; file: string }> = {
  A: { label: 'V5 · z15/q80', file: 'kungsleden-satellite.pmtiles' },
  B: { label: 'V6 · z16/q95', file: 'kungsleden-satellite-v6-z16-q95-candidate.pmtiles' },
};

const LAYER_ID: Record<VariantId, string> = {
  A: 'sat-bench-v5',
  B: 'sat-bench-v6',
};

/** Preset → waypoint id from the canonical generated route (no duplicated
 * coordinates), or an explicit point where the route offers none. */
const WAYPOINT_PRESETS: { key: string; label: string; waypointId: string; zoom: number }[] = [
  { key: 'kebnekaise', label: 'Kebnekaise', waypointId: 'HUT_KEBNEKAISE', zoom: 15.5 },
  { key: 'singi', label: 'Singi', waypointId: 'HUT_SINGI', zoom: 15.5 },
  { key: 'salka', label: 'Sälka', waypointId: 'HUT_SALKA', zoom: 15.5 },
  { key: 'alesjaure', label: 'Alesjaure', waypointId: 'HUT_ALESJAURE', zoom: 15.5 },
  { key: 'tjaktja', label: 'Tjäktja', waypointId: 'HUT_TJAKTJA', zoom: 15.5 },
];

/**
 * Representative point in the western Sentinel-fallback strip (the J6
 * flight-area boundary runs ≈17.86–18.06°E across 68.03–68.50°N — see
 * docs/operations/satellite-hybrid-rollout.md). Chosen just west of the
 * boundary and inside the camera's userBounds, so the Sentinel→Lantmäteriet
 * seam sits in frame at the preset zoom.
 */
const FALLBACK_PRESET = { key: 'fallback', label: 'W fallback', center: [18.045, 68.27] as [number, number], zoom: 14.6 };

const archiveUrl = (file: string): string =>
  new URL(`${import.meta.env.BASE_URL}maps/${file}`, window.location.origin).toString();

class SatBenchmarkControl implements IControl {
  private map: MapLibreMap | null = null;

  private root: HTMLDivElement | null = null;

  private camEl: HTMLDivElement | null = null;

  private buttons: Partial<Record<VariantId, HTMLButtonElement>> = {};

  private active: VariantId;

  /** Optimistic until a MapLibre source error proves an archive absent. */
  private readonly available: Record<VariantId, boolean> = { A: true, B: true };

  private readonly waypoints: BenchWaypoint[];

  private readonly onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.key === '1') this.select('A');
    else if (e.key === '2') this.select('B');
    else if (e.key === ' ') {
      e.preventDefault();
      this.select(this.active === 'A' ? 'B' : 'A');
    }
  };

  private readonly onMove = (): void => {
    if (!this.map || !this.camEl) return;
    const c = this.map.getCenter();
    this.camEl.textContent =
      `z${this.map.getZoom().toFixed(2)}  ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
  };

  constructor(waypoints: BenchWaypoint[]) {
    this.active = 'A';
    this.waypoints = waypoints;
  }

  /**
   * A bench source failed to load (missing candidate file, HTML fallback,
   * …): disable its button, say why, and fall back to the other variant so
   * the ordinary map is never affected.
   */
  markUnavailable(variant: VariantId, reason: string): void {
    if (!this.available[variant]) return;
    this.available[variant] = false;
    const btn = this.buttons[variant];
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    }
    if (this.root) {
      const note = document.createElement('div');
      note.textContent =
        `${VARIANTS[variant].label} unavailable (${reason}) — expected ` +
        `public/maps/${VARIANTS[variant].file}` +
        (variant === 'B' ? '; build it: docs/operations/satellite-v6-z16-benchmark.md' : '');
      note.style.cssText = 'color:#ff9d8a;margin:4px 0;max-width:250px;';
      this.root.appendChild(note);
    }
    if (this.map?.getLayer(LAYER_ID[variant])) {
      this.map.setLayoutProperty(LAYER_ID[variant], 'visibility', 'none');
    }
    if (this.active === variant) {
      const other: VariantId = variant === 'A' ? 'B' : 'A';
      if (this.available[other]) this.select(other);
    }
  }

  select(variant: VariantId): void {
    if (!this.map || !this.available[variant]) return;
    this.active = variant;
    for (const v of ['A', 'B'] as const) {
      if (this.map.getLayer(LAYER_ID[v])) {
        this.map.setLayoutProperty(LAYER_ID[v], 'visibility', v === variant ? 'visible' : 'none');
      }
      const btn = this.buttons[v];
      if (btn) {
        btn.style.background = v === variant ? (v === 'A' ? '#155d8f' : '#8f5a15') : '#242a28';
        btn.style.borderColor = v === variant ? '#fff' : '#3a4441';
      }
    }
  }

  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map;
    const root = document.createElement('div');
    this.root = root;
    root.className = 'maplibregl-ctrl';
    root.style.cssText =
      'background:rgba(17,20,19,.9);color:#eef2ef;border-radius:8px;padding:10px 12px;' +
      'font:12px/1.6 -apple-system,system-ui,sans-serif;max-width:270px;pointer-events:auto;';

    const title = document.createElement('div');
    title.textContent = 'SAT A/B benchmark (dev only)';
    title.style.cssText = 'font-weight:600;margin-bottom:6px;opacity:.85;';
    root.appendChild(title);

    const row = document.createElement('div');
    for (const v of ['A', 'B'] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = VARIANTS[v].label;
      btn.style.cssText =
        'margin:0 6px 6px 0;padding:4px 9px;border-radius:6px;border:1px solid #3a4441;' +
        'background:#242a28;color:#e7ece9;font-size:12px;cursor:pointer;';
      btn.addEventListener('click', () => this.select(v));
      this.buttons[v] = btn;
      row.appendChild(btn);
    }
    root.appendChild(row);

    this.camEl = document.createElement('div');
    this.camEl.style.cssText = 'font-variant-numeric:tabular-nums;opacity:.85;margin-bottom:6px;';
    root.appendChild(this.camEl);

    const presets = document.createElement('div');
    const jump = (center: [number, number], zoom: number): void => {
      // jumpTo with only centre+zoom leaves bearing/pitch untouched; manual
      // pan/zoom afterwards works exactly as on the normal map.
      this.map?.jumpTo({ center, zoom });
    };
    const presetButton = (label: string, center: [number, number], zoom: number): void => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.cssText =
        'margin:0 4px 4px 0;padding:3px 7px;border-radius:6px;border:1px solid #3a4441;' +
        'background:#242a28;color:#cfd8d3;font-size:11px;cursor:pointer;';
      btn.addEventListener('click', () => jump(center, zoom));
      presets.appendChild(btn);
    };
    for (const p of WAYPOINT_PRESETS) {
      const w = this.waypoints.find((x) => x.id === p.waypointId);
      if (w) presetButton(p.label, [w.lon, w.lat], p.zoom);
    }
    presetButton(FALLBACK_PRESET.label, FALLBACK_PRESET.center, FALLBACK_PRESET.zoom);
    root.appendChild(presets);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy camera';
    copy.style.cssText =
      'margin-top:2px;padding:3px 8px;border-radius:6px;border:1px solid #3a4441;' +
      'background:#242a28;color:#e7ece9;font-size:11px;cursor:pointer;';
    copy.addEventListener('click', () => {
      if (!this.map) return;
      const c = this.map.getCenter();
      const text =
        `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)} @ z${this.map.getZoom().toFixed(2)} ` +
        `(bearing ${this.map.getBearing().toFixed(1)}, pitch ${this.map.getPitch().toFixed(1)})`;
      void navigator.clipboard?.writeText(text).then(() => {
        copy.textContent = 'Copied ✓';
        setTimeout(() => { copy.textContent = 'Copy camera'; }, 1200);
      });
    });
    root.appendChild(copy);

    const hint = document.createElement('div');
    hint.textContent = '1 = v5 · 2 = v6 · space = toggle';
    hint.style.cssText = 'opacity:.6;margin-top:4px;';
    root.appendChild(hint);

    window.addEventListener('keydown', this.onKey);
    map.on('move', this.onMove);
    this.onMove();
    this.select(this.active);
    return root;
  }

  onRemove(): void {
    window.removeEventListener('keydown', this.onKey);
    this.map?.off('move', this.onMove);
    this.root?.remove();
    this.root = null;
    this.map = null;
  }
}

/**
 * Install the benchmark onto a loaded map: one hosted pmtiles:// raster
 * source + hidden layer per available archive (inserted below the route
 * overlays), plus the floating control. Called from MapView, only behind
 * the DEV + query-parameter gate.
 */
export function installSatBenchmark(map: MapLibreMap, waypoints: BenchWaypoint[]): void {
  ensurePmtilesProtocol();
  // Below the route/hut/GPS overlays, above everything the basemap draws
  // (including the ordinary satellite layer, whose behaviour is untouched).
  const beforeId = map.getLayer('route-overview') ? 'route-overview' : undefined;
  for (const v of ['A', 'B'] as const) {
    map.addSource(LAYER_ID[v], {
      type: 'raster',
      url: `pmtiles://${archiveUrl(VARIANTS[v].file)}`,
      tileSize: 256,
    });
    map.addLayer(
      {
        id: LAYER_ID[v],
        type: 'raster',
        source: LAYER_ID[v],
        layout: { visibility: 'none' },
        paint: { 'raster-fade-duration': 0 },
      },
      beforeId,
    );
  }
  const control = new SatBenchmarkControl(waypoints);
  // Archive absence is detected through MapLibre's own source errors (a
  // missing file 404s / comes back as HTML and fails the PMTiles header
  // read) — the benchmark makes no network requests of its own; every byte
  // flows through the same pmtiles protocol path as the ordinary map.
  map.on('error', (event) => {
    const sourceId = (event as { sourceId?: string }).sourceId;
    const variant = (Object.keys(LAYER_ID) as VariantId[]).find((v) => LAYER_ID[v] === sourceId);
    if (variant) {
      control.markUnavailable(variant, (event.error as Error | undefined)?.message ?? 'failed to load');
    }
  });
  map.addControl(control, 'top-left');
}
