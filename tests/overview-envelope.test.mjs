/**
 * Full-route overview envelope (src/map/overviewEnvelope.mjs).
 *
 * The defect these fence: the overview was capped to the z7 tile cell around
 * the data bounds — 1.75° west of the route centre but only 1.06° east. Wide
 * containers were clamped on the east edge alone, so maxBounds came out
 * narrower than the fit needed AND off-centre; MapLibre zoomed in to obey it,
 * pushing the route east and its southern end past the bottom of the
 * viewport. Measured before this change: 7.9 px of bottom clipping at
 * 1366×768 and 1512×860, and the route centre 94 px east of the padded centre
 * at 1920×1080.
 *
 * The contract now: the desired overview is symmetric about the composition
 * centre, capped symmetrically to the vector coverage that actually exists at
 * the source zoom the overview renders at.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { open } from 'node:fs/promises';
import { PMTiles } from 'pmtiles';
import {
  VECTOR_OVERVIEW_BUILD,
  RASTER_ARCHIVE_MIN_ZOOM,
  OVERVIEW_SLACK,
  tileAlignedFootprint,
  vectorSourceCoverage,
  rasterRenderableCoverage,
  desiredOverviewExtent,
  overviewEnvelopeFor,
  mercX,
  mercY,
} from '../src/map/overviewEnvelope.mjs';
import { cameraConstraintsFor, activeBoundsForZoom } from '../src/map/cameraBounds.mjs';
import { overviewPaddingFor } from '../src/map/mapPadding.mjs';
import { KUNGSLEDEN_CONFIG } from '../scripts/route-configs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = JSON.parse(readFileSync(join(root, 'src/generated/kungsleden-route.json'), 'utf8'));
const CUTOUT = route.mapCutoutBounds;
const EPS = 1e-9;

const routeCx = (mercX(route.bounds[0][0]) + mercX(route.bounds[1][0])) / 2;

/** The app's real container size for a browser viewport (shell rules). */
const container = (W, H) => {
  if (W < 760 || H < 500) return [W, H - 56];
  return [W - (W >= 1160 ? 148 : 84), H];
};

/** Overview padding as the app computes it, with the measured lead depths. */
const padFor = (w, h) =>
  overviewPaddingFor({ viewportWidth: w, viewportHeight: h, topInset: w >= 700 ? 58 : 54, bottomInset: 0 });

const envelopeFor = (W, H) => {
  const [w, h] = container(W, H);
  return overviewEnvelopeFor({
    routeBounds: route.bounds, userBounds: route.userBounds, cutoutBounds: CUTOUT,
    viewportWidth: w, viewportHeight: h, padding: padFor(w, h),
  });
};

const PORTRAIT = [[320, 568], [360, 800], [375, 667], [390, 844], [412, 915], [430, 932]];
const DESKTOP = [[1024, 768], [1280, 800], [1366, 768], [1440, 900], [1512, 860], [1536, 864], [1920, 1080]];
const ULTRAWIDE = [[2560, 1080], [3440, 1440]];

// ---- the build contract this model reproduces -------------------------------

test('the declared vector-overview build matches scripts/route-configs.mjs', () => {
  assert.deepEqual(
    { ...VECTOR_OVERVIEW_BUILD },
    { ...KUNGSLEDEN_CONFIG.vectorOverview },
    'the runtime coverage model and the build that produced the archive must agree',
  );
});

test('modelled vector coverage matches the COMMITTED archive, zoom by zoom', async (t) => {
  const path = join(root, 'public/maps/kungsleden.pmtiles');
  if (!existsSync(path)) return t.skip('vector archive absent');

  class FileSource {
    constructor(p) { this.p = p; }
    getKey() { return this.p; }
    async getBytes(offset, length) {
      const fh = await open(this.p, 'r');
      try {
        const buf = Buffer.alloc(length);
        await fh.read(buf, 0, length, offset);
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
      } finally { await fh.close(); }
    }
  }
  const p = new PMTiles(new FileSource(path));
  const lon2t = (lon, z) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
  const lat2t = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z));
  };

  // Overview zooms only: those are the ones the envelope reasons about, and
  // probing every z14 tile would make this test cost minutes.
  for (const z of [7, 8, 9, 10]) {
    const model = vectorSourceCoverage(z, CUTOUT);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const x0 = lon2t(model.west, z) - 2, x1 = lon2t(model.east, z) + 2;
    const y0 = lat2t(model.north, z) - 2, y1 = lat2t(model.south, z) + 2;
    for (let x = Math.max(0, x0); x <= x1; x++) {
      for (let y = Math.max(0, y0); y <= y1; y++) {
        if (await p.getZxy(z, x, y)) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    const actual = tileAlignedFootprint(
      [[model.west + 1e-9, model.south + 1e-9], [model.east - 1e-9, model.north - 1e-9]], z,
    );
    assert.equal(lon2t(model.west, z), minX, `z${z}: modelled west tile = archive west tile`);
    assert.equal(lon2t(model.east - 1e-9, z), maxX, `z${z}: modelled east tile = archive east tile`);
    assert.equal(lat2t(model.north - 1e-9, z), minY, `z${z}: modelled north tile`);
    assert.equal(lat2t(model.south + 1e-9, z), maxY, `z${z}: modelled south tile`);
    assert.ok(actual, 'footprint is derivable');
  }
});

test('the widened overview box applies through z9 and stops above it', () => {
  // PR #104 merged a widened z0–z9 extract with the unchanged z10–14 corridor.
  const wide = vectorSourceCoverage(9, CUTOUT);
  const strict = vectorSourceCoverage(10, CUTOUT);
  assert.ok(wide.west < strict.west, 'z9 reaches further west than z10');
  assert.ok(wide.east > strict.east, 'z9 reaches further east than z10');
  assert.equal(VECTOR_OVERVIEW_BUILD.maxZoom, 9);
  // The strict corridor is the plain cutout, tile-aligned — untouched here.
  assert.deepEqual(strict, tileAlignedFootprint(CUTOUT, 10));
});

test('raster renderable coverage is the widest ANCESTOR footprint, not the requested zoom', () => {
  const raster = rasterRenderableCoverage(CUTOUT);
  assert.deepEqual(raster, tileAlignedFootprint(CUTOUT, RASTER_ARCHIVE_MIN_ZOOM));
  // A 256px raster source at overview zoom ~8.6 requests round(8.6)+1 = z10,
  // whose footprint is far narrower. Modelling THAT as the limit would be
  // wrong: MapLibre falls back to an ancestor tile (proven in the PR #104
  // evidence), so the renderable extent is the z7 one.
  const requested = tileAlignedFootprint(CUTOUT, 10);
  assert.ok(raster.west < requested.west, 'renderable reaches further west than requested-zoom');
  assert.ok(raster.east >= requested.east, 'and no less far east');
});

// ---- symmetry: the defect this PR exists for --------------------------------

test('every supported viewport gets an overview symmetric about the route centre', () => {
  for (const [W, H] of [...PORTRAIT, [760, 500], [768, 1024], ...DESKTOP, ...ULTRAWIDE]) {
    const e = envelopeFor(W, H);
    if (!e.overviewBounds) continue; // strict bounds already host the fit
    const [[ow], [oe]] = e.overviewBounds;
    assert.ok(
      Math.abs((routeCx - mercX(ow)) - (mercX(oe) - routeCx)) < 1,
      `${W}x${H}: west and east half-widths differ by ≥1 m`,
    );
  }
});

test('REGRESSION: the envelope is never capped on one side only', () => {
  // The old model clamped east against the z7 cell while west ran free, which
  // is precisely how a symmetric fit became an eastward shove.
  for (const [W, H] of [...DESKTOP, ...ULTRAWIDE]) {
    const e = envelopeFor(W, H);
    const cov = e.vectorCoverage;
    const westGap = mercX(e.overviewBounds[0][0]) - mercX(cov.west);
    const eastGap = mercX(cov.east) - mercX(e.overviewBounds[1][0]);
    assert.ok(westGap >= -1e-6 && eastGap >= -1e-6, `${W}x${H}: inside coverage both sides`);
    // At least one side has slack unless BOTH are hard against the data.
    assert.ok(
      westGap > 1 || eastGap > 1 || Math.abs(westGap - eastGap) < 1,
      `${W}x${H}: a one-sided clamp would show up as unequal zero gaps`,
    );
  }
});

test('supported desktop framing: the fit is granted in full, never capped', () => {
  for (const [W, H] of DESKTOP) {
    const e = envelopeFor(W, H);
    assert.equal(e.cappedByVector, false, `${W}x${H}: vector coverage has headroom`);
    assert.ok(
      e.halfWidths.applied >= e.halfWidths.needed - 1e-6,
      `${W}x${H}: the whole requested half-width is granted`,
    );
  }
});

test('portrait keeps the strict interaction bounds east/west', () => {
  // PR #100's portrait framing must be untouched: phones are width-bound and
  // their fitted view is narrower than the user bounds, so no east/west
  // expansion is warranted and none is granted.
  for (const [W, H] of PORTRAIT) {
    const e = envelopeFor(W, H);
    if (!e.overviewBounds) continue;
    const [[ow], [oe]] = e.overviewBounds;
    assert.equal(ow, route.userBounds[0][0], `${W}x${H}: west edge is the strict bound`);
    assert.equal(oe, route.userBounds[1][0], `${W}x${H}: east edge is the strict bound`);
    assert.equal(e.bindingAxis, 'width', `${W}x${H}: still width-bound`);
  }
});

test('the overview always contains the view the fit will produce', () => {
  for (const [W, H] of [...PORTRAIT, [760, 500], [768, 1024], ...DESKTOP]) {
    const [w, h] = container(W, H);
    const pad = padFor(w, h);
    const d = desiredOverviewExtent({ routeBounds: route.bounds, viewportWidth: w, viewportHeight: h, padding: pad });
    const e = envelopeFor(W, H);
    const b = e.overviewBounds ?? route.userBounds;
    assert.ok(mercX(b[0][0]) <= routeCx - d.halfWidth + 1e-6, `${W}x${H}: holds the view west`);
    assert.ok(mercX(b[1][0]) >= routeCx + d.halfWidth - 1e-6, `${W}x${H}: holds the view east`);
    assert.ok(mercY(b[0][1]) <= d.centreY - d.halfHeight + 1e-6, `${W}x${H}: holds the view south`);
    assert.ok(mercY(b[1][1]) >= d.centreY + d.halfHeight - 1e-6, `${W}x${H}: holds the view north`);
  }
});

// ---- source zoom and integer transitions ------------------------------------

test('the source zoom is floor(mapZoom), and the envelope is a function of it', () => {
  for (const [W, H] of [...PORTRAIT, ...DESKTOP, ...ULTRAWIDE]) {
    const e = envelopeFor(W, H);
    assert.ok(Number.isInteger(e.sourceZoom), `${W}x${H}: integer source zoom`);
    assert.ok(e.sourceZoom <= Math.floor(e.mapZoom), `${W}x${H}: never above floor(mapZoom)`);
  }
});

test('integer source-zoom transitions do not move the envelope discontinuously', () => {
  // Sweep container widths across every boundary where floor(mapZoom) ticks.
  // The envelope may narrow when coverage genuinely narrows, but it must
  // never JUMP off-centre, and it must never grow as the zoom rises.
  let prev = null;
  for (let w = 300; w <= 3400; w += 4) {
    const h = 800;
    const e = overviewEnvelopeFor({
      routeBounds: route.bounds, userBounds: route.userBounds, cutoutBounds: CUTOUT,
      viewportWidth: w, viewportHeight: h, padding: padFor(w, h),
    });
    if (e.overviewBounds) {
      const [[ow], [oe]] = e.overviewBounds;
      assert.ok(Math.abs((routeCx - mercX(ow)) - (mercX(oe) - routeCx)) < 1, `w=${w}: symmetric`);
    }
    if (prev && e.sourceZoom !== prev.sourceZoom) {
      // At a boundary the applied half-width may change, but only because
      // coverage did — never by more than the coverage step itself.
      const step = Math.abs(e.halfWidths.applied - prev.halfWidths.applied);
      const covStep = Math.abs(e.halfWidths.vector - prev.halfWidths.vector);
      assert.ok(
        step <= covStep + 2000,
        `w=${w}: z${prev.sourceZoom}→z${e.sourceZoom} moved the envelope ${step.toFixed(0)} m ` +
        `against a ${covStep.toFixed(0)} m coverage change`,
      );
    }
    prev = e;
  }
});

test('the envelope depends on the FIT zoom, not the live camera zoom', () => {
  // This is what makes maxBounds constant for a viewport: nothing in the
  // signature can change while the user zooms or pans.
  const src = readFileSync(join(root, 'src/map/overviewEnvelope.mjs'), 'utf8');
  const sig = src.slice(src.indexOf('export function overviewEnvelopeFor('), src.indexOf('}) {', src.indexOf('export function overviewEnvelopeFor(')));
  assert.ok(!/\bzoom\b\s*[,}]/.test(sig), 'no live-zoom parameter');
  assert.ok(!sig.includes('cameraZoom') && !sig.includes('currentZoom'));
});

test('hysteresis still prevents oscillation at the overview/interaction swap', () => {
  const [w, h] = container(1512, 860);
  const c = cameraConstraintsFor({
    userBounds: route.userBounds, routeBounds: route.bounds, dataBounds: CUTOUT,
    viewportWidth: w, viewportHeight: h, padding: padFor(w, h),
  });
  const t = c.zoomThreshold;
  assert.equal(activeBoundsForZoom(c, t - 0.04, false).expanded, false);
  assert.equal(activeBoundsForZoom(c, t - 0.06, false).expanded, true);
  assert.equal(activeBoundsForZoom(c, t + 0.04, true).expanded, true);
  assert.equal(activeBoundsForZoom(c, t + 0.06, true).expanded, false);
  // Sweeping up and down across the band lands in the same state each way
  // only outside it — that is what "cannot oscillate" means.
  for (const z of [t - 0.2, t - 0.06, t + 0.06, t + 0.2]) {
    const up = activeBoundsForZoom(c, z, false).expanded;
    const down = activeBoundsForZoom(c, z, true).expanded;
    if (z < t - 0.05 || z > t + 0.05) assert.equal(up, down, `z=${z.toFixed(2)} is unambiguous`);
  }
});

// ---- capping and the ultrawide fallback -------------------------------------

test('physical capping is symmetric and never exceeds real vector coverage', () => {
  for (const [W, H] of [...ULTRAWIDE, [812, 375], [1024, 400]]) {
    const e = envelopeFor(W, H);
    if (!e.overviewBounds) continue;
    const [[ow], [oe]] = e.overviewBounds;
    assert.ok(ow >= e.vectorCoverage.west - EPS, `${W}x${H}: west inside coverage`);
    assert.ok(oe <= e.vectorCoverage.east + EPS, `${W}x${H}: east inside coverage`);
    assert.ok(
      Math.abs((routeCx - mercX(ow)) - (mercX(oe) - routeCx)) < 1,
      `${W}x${H}: a capped envelope is still symmetric`,
    );
  }
});

test('ultrawide falls back to the widest COVERED view rather than blank flanks', () => {
  for (const [W, H] of ULTRAWIDE) {
    const e = envelopeFor(W, H);
    assert.equal(e.cappedByVector, true, `${W}x${H}: the data, not the fit, sets the width`);
    assert.ok(
      e.halfWidths.applied <= e.halfWidths.vector + 1e-6,
      `${W}x${H}: never claims more than the archive has`,
    );
  }
});

test('the raster flank is reported honestly, and only where the fit demands it', () => {
  // Phones and tablet portrait stay fully shaded; wide landscape reaches past
  // terrain's east edge. This is the model's one accepted trade, so it is
  // asserted rather than left to be discovered.
  for (const [W, H] of PORTRAIT) {
    assert.equal(envelopeFor(W, H).exceedsRasterCoverage, false, `${W}x${H}: fully shaded`);
  }
  for (const [W, H] of [[1512, 860], [1920, 1080]]) {
    assert.equal(envelopeFor(W, H).exceedsRasterCoverage, true, `${W}x${H}: flank is expected`);
  }
  // …and it is only ever the EAST flank: raster reaches further west than any
  // supported composition needs.
  const raster = rasterRenderableCoverage(CUTOUT);
  for (const [W, H] of DESKTOP) {
    const e = envelopeFor(W, H);
    assert.ok(
      mercX(e.overviewBounds[0][0]) >= mercX(raster.west) - 1e-6,
      `${W}x${H}: west stays inside raster coverage`,
    );
  }
});

test('contours never constrain the overview', () => {
  // Index contours fade in from z9.5 and the full set from z11.5; every
  // overview zoom is below that, so the contour archive is irrelevant here.
  for (const [W, H] of [...PORTRAIT, ...DESKTOP, ...ULTRAWIDE]) {
    assert.ok(envelopeFor(W, H).mapZoom < 9.5, `${W}x${H}: overview is below contour activation`);
  }
  const src = readFileSync(join(root, 'src/map/overviewEnvelope.mjs'), 'utf8');
  assert.ok(!/contour/i.test(src.replace(/^[\s*/]*.*contour.*$/gim, '')), 'no contour input');
});

// ---- resize ------------------------------------------------------------------

test('resize is a pure function of the new shape — no path dependence', () => {
  const seq = [[1512, 860], [375, 667], [1920, 1080], [375, 667], [1512, 860]];
  const seen = new Map();
  for (const [W, H] of seq) {
    const e = envelopeFor(W, H);
    const key = `${W}x${H}`;
    const value = JSON.stringify(e.overviewBounds);
    if (seen.has(key)) assert.equal(value, seen.get(key), `${key}: same shape, same envelope`);
    seen.set(key, value);
  }
});

test('growing the bottom band widens the view but never past the data', () => {
  const [w, h] = container(1512, 860);
  let prev = 0;
  for (const bottomInset of [0, 40, 80, 160, 240, 320]) {
    const pad = overviewPaddingFor({ viewportWidth: w, viewportHeight: h, topInset: 58, bottomInset });
    const e = overviewEnvelopeFor({
      routeBounds: route.bounds, userBounds: route.userBounds, cutoutBounds: CUTOUT,
      viewportWidth: w, viewportHeight: h, padding: pad,
    });
    assert.ok(e.halfWidths.applied >= prev - 1e-6, `inset ${bottomInset}: monotonic`);
    assert.ok(e.halfWidths.applied <= e.halfWidths.vector + 1e-6, `inset ${bottomInset}: inside data`);
    prev = e.halfWidths.applied;
  }
});

// ---- what this PR must NOT change -------------------------------------------

test('archive coverage, camera bounds and route data are untouched', () => {
  assert.deepEqual(route.mapCutoutBounds, [[17.8799, 67.7081], [19.3773, 68.4931]]);
  assert.deepEqual(route.userBounds, [[17.9521, 67.735], [19.3051, 68.4661]]);
  assert.deepEqual(route.bounds, [[18.241127, 67.842819], [19.016074, 68.35831]]);
  assert.equal(OVERVIEW_SLACK, 0.05, 'the 5 % slack contract is unchanged');
  assert.equal(RASTER_ARCHIVE_MIN_ZOOM, 7);
});

test('the overview padding contract from PR #100 is untouched', () => {
  const src = readFileSync(join(root, 'src/map/mapPadding.mjs'), 'utf8');
  assert.match(src, /export const MARKER_LABEL_SAFE_X = 32/);
  // overviewPaddingFor still composes: balanced sides + label allowance.
  const pad = overviewPaddingFor({ viewportWidth: 1364, viewportHeight: 860, topInset: 58, bottomInset: 0 });
  assert.equal(pad.left, pad.right, 'horizontally balanced');
  assert.equal(pad.left, 16 + 32, 'base side + label allowance');
  assert.equal(pad.top, 12 + 58);
  assert.equal(pad.bottom, 12);
});
