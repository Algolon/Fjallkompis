/**
 * Full-route overview framing evidence.
 *
 * Drives a real Chrome (one disposable profile) against the dev server and
 * records, for every supported viewport: the real Map-container size, the
 * settled camera, the effective vector source zoom, the overview padding,
 * the active maxBounds, the projected route box, route/label clearances, the
 * padded-centre deviation, blank vector pixels, the settled camera-move count
 * and console errors.
 *
 * "Blank" is measured SEMANTICALLY, not by colour: a point is blank when
 * queryRenderedFeatures returns nothing there, i.e. no vector tile drew
 * anything. The style's background layer paints the whole viewport
 * regardless, so a colour test could not tell missing data from legitimately
 * empty ground.
 *
 * The overview padding is computed in node from the app's OWN
 * overviewPaddingFor(), fed the overlay depths measured in the page — the
 * harness never re-implements the padding contract.
 *
 * Reproduce:
 *   npm run dev -- --port 4750 --strictPort
 *   npm i playwright-core          # in any scratch directory
 *   APP_URL=http://localhost:4750/Fjallkompis/ OUT_DIR=<this dir> \
 *   PROFILE_ROOT=/tmp/fk-framing LABEL=after node capture-framing.mjs
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overviewPaddingFor } from '../../../../src/map/mapPadding.mjs';
import { coverageForMode, mercX } from '../../../../src/map/overviewEnvelope.mjs';

const BASE = process.env.APP_URL;
const OUT = process.env.OUT_DIR;
const PROFILES = process.env.PROFILE_ROOT;
const LABEL = process.env.LABEL ?? 'run';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS !== '0';
const DPR = Number(process.env.DPR ?? 2);
/** 'terrain' | 'satellite' — which imagery the evidence is captured in. */
const MODE = process.env.MODE ?? 'terrain';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const ROUTE = JSON.parse(readFileSync(join(repoRoot, 'src/generated/kungsleden-route.json'), 'utf8'));
const ROUTE_BOUNDS = ROUTE.bounds;

mkdirSync(OUT, { recursive: true });

export const VIEWPORTS = [
  { w: 320, h: 568, cls: 'portrait' },
  { w: 360, h: 800, cls: 'portrait' },
  { w: 375, h: 667, cls: 'portrait' },
  { w: 390, h: 844, cls: 'portrait' },
  { w: 412, h: 915, cls: 'portrait' },
  { w: 430, h: 932, cls: 'portrait' },
  { w: 760, h: 500, cls: 'tablet' },
  { w: 768, h: 1024, cls: 'tablet' },
  { w: 1024, h: 768, cls: 'laptop' },
  { w: 1280, h: 800, cls: 'laptop' },
  { w: 1366, h: 768, cls: 'laptop' },
  { w: 1440, h: 900, cls: 'laptop' },
  { w: 1512, h: 860, cls: 'laptop' },
  { w: 1512, h: 872, cls: 'laptop' },
  { w: 1536, h: 864, cls: 'laptop' },
  { w: 1920, h: 1080, cls: 'desktop' },
  { w: 2560, h: 1080, cls: 'ultrawide' },
  { w: 3440, h: 1440, cls: 'ultrawide' },
];

const measureScript = (routeBounds) => `(() => {
  const map = window.__fjallkompisMap;
  const el = document.querySelector('.mapview');
  const r = el.getBoundingClientRect();
  const W = el.clientWidth, H = el.clientHeight;
  const route = ${JSON.stringify(routeBounds)};

  const rel = (n) => {
    if (!n) return null;
    const b = n.getBoundingClientRect();
    return { x: +(b.x - r.x).toFixed(1), y: +(b.y - r.y).toFixed(1),
             w: +b.width.toFixed(1), h: +b.height.toFixed(1),
             right: +(b.right - r.x).toFixed(1), bottom: +(b.bottom - r.y).toFixed(1) };
  };

  const [[rw, rs], [re, rn]] = route;
  const nw = map.project([rw, rn]), se = map.project([re, rs]);
  const routeBox = { x: +nw.x.toFixed(1), y: +nw.y.toFixed(1),
                     right: +se.x.toFixed(1), bottom: +se.y.toFixed(1),
                     w: +(se.x - nw.x).toFixed(1), h: +(se.y - nw.y).toFixed(1) };

  const markers = {};
  for (const hut of document.querySelectorAll('.map-hut')) {
    const name = hut.querySelector('.map-hut__label')?.textContent?.trim() ?? '?';
    const g = rel(hut), l = rel(hut.querySelector('.map-hut__label'));
    markers[name] = {
      glyph: g, label: l,
      glyphClear: g && { left: g.x, right: +(W - g.right).toFixed(1), top: g.y, bottom: +(H - g.bottom).toFixed(1) },
      labelClear: l && { left: l.x, right: +(W - l.right).toFixed(1), top: l.y, bottom: +(H - l.bottom).toFixed(1) },
    };
  }

  // Blank = no rendered vector feature at all at that point.
  const blankAt = (x, y) => map.queryRenderedFeatures([x, y]).length === 0;
  const scanRow = (y) => {
    let left = 0, right = 0;
    for (let x = 0; x < W && blankAt(x + 0.5, y); x += 1) left++;
    for (let x = W - 1; x >= 0 && blankAt(x + 0.5, y); x -= 1) right++;
    return { left, right };
  };
  const rows = [Math.round(H * 0.25), Math.round(H * 0.5), Math.round(H * 0.75)];
  const scans = rows.map(scanRow);
  let blankGrid = 0, gridN = 0;
  for (let x = 4; x < W; x += 16) for (let y = 4; y < H; y += 16) { gridN++; if (blankAt(x, y)) blankGrid++; }

  const c = map.getCenter();
  const mb = map.getMaxBounds();
  const vb = map.getBounds();
  const box = el.getBoundingClientRect();
  const depth = (sel, edge) => {
    const n = document.querySelector(sel);
    if (!n) return 0;
    const b = n.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return 0;
    if (edge === 'top') return Math.max(0, b.bottom - box.top);
    if (edge === 'bottom') return Math.max(0, box.bottom - b.top);
    return Math.max(0, box.right - b.left);
  };

  return {
    mapW: W, mapH: H, dpr: window.devicePixelRatio,
    docOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    docOverflowY: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight),
    navVisible: !!document.querySelector('.tabbar--rail')?.offsetParent,
    topInset: Math.round(depth('.map-cockpit-lead', 'top')),
    bottomInset: Math.round(depth('.map-cockpit-bottom', 'bottom')),
    camera: { lng: +c.lng.toFixed(6), lat: +c.lat.toFixed(6), zoom: +map.getZoom().toFixed(4),
              bearing: map.getBearing(), pitch: map.getPitch() },
    sourceZoom: Math.floor(map.getZoom()),
    maxBounds: mb ? [[+mb.getWest().toFixed(6), +mb.getSouth().toFixed(6)],
                     [+mb.getEast().toFixed(6), +mb.getNorth().toFixed(6)]] : null,
    visibleExtent: [[+vb.getWest().toFixed(6), +vb.getSouth().toFixed(6)],
                    [+vb.getEast().toFixed(6), +vb.getNorth().toFixed(6)]],
    routeBox,
    routeClearance: { left: +routeBox.x.toFixed(1), right: +(W - routeBox.right).toFixed(1),
                      top: +routeBox.y.toFixed(1), bottom: +(H - routeBox.bottom).toFixed(1) },
    blank: { rows, scans, midLeftPx: scans[1].left, midRightPx: scans[1].right,
             worstLeftPx: Math.max(...scans.map((s) => s.left)),
             worstRightPx: Math.max(...scans.map((s) => s.right)),
             gridFraction: +(blankGrid / gridN).toFixed(4), gridSamples: gridN },
    markers,
    cameraMoves: window.__fjallkompisCameraMoves,
    leadRect: rel(document.querySelector('.map-cockpit-lead')),
    controlsRect: rel(document.querySelector('.map-controls, .map-control-stack')),
  };
})()`;

const dir = join(PROFILES, `framing-${LABEL}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--remote-debugging-port=9800', `--user-data-dir=${dir}`,
  '--no-first-run', '--no-default-browser-check', '--headless=new',
  `--force-device-scale-factor=${DPR}`, '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let browser;
for (let i = 0; i < 80 && !browser; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9800'); } catch {}
}
if (!browser) throw new Error('could not attach to Chrome');
const page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].newPage());

const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

const results = [];
for (const vp of VIEWPORTS) {
  const key = `${vp.w}x${vp.h}`;
  if (ONLY && !ONLY.includes(key)) continue;
  consoleErrors.length = 0;

  // Hash routing never reloads, so every viewport gets a FRESH MOUNT via
  // about:blank first — otherwise this measures a resize, not the initial fit
  // (and the camera-move counter would carry over).
  await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto(`${BASE}#/map`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const later = page.getByRole('button', { name: 'Later' });
  if (await later.count()) await later.first().click().catch(() => {});
  await page.waitForFunction(() => !!window.__fjallkompisMap, null, { timeout: 30_000 });
  await page.waitForTimeout(3000);

  if (MODE === 'satellite') {
    // Switch imagery, then take an EXPLICIT Fit route: the selected mode is
    // authoritative from the next full-route action, never from the toggle.
    const sat = page.getByRole('button', { name: /Satellite/i });
    if (await sat.count()) await sat.first().click().catch(() => {});
    await page.waitForTimeout(1500);
    const fit = page.getByRole('button', { name: 'Fit route' });
    if (await fit.count()) await fit.first().click();
  }
  await page.waitForTimeout(4000);

  const moves1 = await page.evaluate(() => window.__fjallkompisCameraMoves);
  await page.waitForTimeout(2000);
  const moves2 = await page.evaluate(() => window.__fjallkompisCameraMoves);

  const m = await page.evaluate(measureScript(ROUTE_BOUNDS));

  // The explicit "Fit route" action, measured separately: the initial camera
  // and this must agree, or the overview is not one stable composition.
  const fit = page.getByRole('button', { name: 'Fit route' });
  if (await fit.count()) {
    await fit.first().click();
    await page.waitForTimeout(3000);
    const f = await page.evaluate(measureScript(ROUTE_BOUNDS));
    m.fitRoute = {
      camera: f.camera, sourceZoom: f.sourceZoom, routeBox: f.routeBox,
      routeClearance: f.routeClearance, blank: f.blank,
      movesAfter: f.cameraMoves,
      matchesInitial:
        Math.abs(f.camera.zoom - m.camera.zoom) < 0.01 &&
        Math.abs(f.camera.lng - m.camera.lng) < 1e-4 &&
        Math.abs(f.camera.lat - m.camera.lat) < 1e-4,
    };
  }

  // The app's own padding contract, fed the depths measured in the page.
  const pad = overviewPaddingFor({
    viewportWidth: m.mapW, viewportHeight: m.mapH,
    topInset: m.topInset, bottomInset: m.bottomInset,
  });
  const padded = { x: pad.left, y: pad.top, w: m.mapW - pad.left - pad.right, h: m.mapH - pad.top - pad.bottom };
  m.overviewPadding = pad;
  m.paddedRect = padded;
  m.paddedCentreDeviation = {
    x: +(((m.routeBox.x + m.routeBox.right) / 2) - (padded.x + padded.w / 2)).toFixed(1),
    y: +(((m.routeBox.y + m.routeBox.bottom) / 2) - (padded.y + padded.h / 2)).toFixed(1),
  };
  // Unshaded pixels: how far the visible viewport overhangs the renderable
  // hillshade envelope, in CSS px. MUST be zero in Terrain mode.
  const cov = coverageForMode(MODE, ROUTE.mapCutoutBounds);
  const mPerPx = (mercX(m.visibleExtent[1][0]) - mercX(m.visibleExtent[0][0])) / m.mapW;
  m.imageryMode = MODE;
  m.rasterEnvelope = [[cov.west, cov.south], [cov.east, cov.north]];
  m.uncoveredPx = {
    west: Math.max(0, +((mercX(cov.west) - mercX(m.visibleExtent[0][0])) / mPerPx).toFixed(1)),
    east: Math.max(0, +((mercX(m.visibleExtent[1][0]) - mercX(cov.east)) / mPerPx).toFixed(1)),
  };
  m.viewport = key;
  m.class = vp.cls;
  m.cameraStableAfterSettle = moves1 === moves2;
  m.consoleErrors = [...consoleErrors];
  results.push(m);

  if (SHOTS) await page.screenshot({ path: join(OUT, `${LABEL}-${key}.png`) });

  const worstEnd = ['Abisko', 'Nikkaluokta']
    .map((n) => m.markers[n]?.labelClear)
    .filter(Boolean)
    .flatMap((c) => [c.left, c.right, c.top, c.bottom]);
  console.log(
    `${key.padStart(10)} map ${String(m.mapW).padStart(4)}×${String(m.mapH).padStart(4)}` +
    ` z${String(m.camera.zoom).padStart(7)}/src${m.sourceZoom}` +
    ` clrT${String(m.routeClearance.top).padStart(6)} clrB${String(m.routeClearance.bottom).padStart(7)}` +
    ` dev(${String(m.paddedCentreDeviation.x).padStart(6)},${String(m.paddedCentreDeviation.y).padStart(6)})` +
    ` blank L${String(m.blank.worstLeftPx).padStart(4)} R${String(m.blank.worstRightPx).padStart(4)}` +
    ` endLbl ${worstEnd.length ? Math.min(...worstEnd).toFixed(1).padStart(7) : '   n/a'}` +
    ` mv${m.cameraMoves} err${m.consoleErrors.length}`,
  );
}

writeFileSync(join(OUT, `${LABEL}-measurements.json`), JSON.stringify(results, null, 2) + '\n');
console.log(`\nWrote ${join(OUT, `${LABEL}-measurements.json`)}`);
await browser.close().catch(() => {});
proc.kill();
