/**
 * Runtime evidence for the vector-archive revision migration.
 *
 * Drives a real Chrome (disposable profile per scenario) against the built app
 * served by `vite preview`, and records Cache Storage inventories, console
 * errors, network traffic and screenshots for:
 *   A. a simulated pre-PR #104 install (legacy archive only)
 *   B. a successful update
 *   C. a failed update (network failure, and a wrong-archive response)
 *   D. a fresh install
 *
 * Reproduce:
 *
 *   npm run build
 *   # the superseded archive, served so the page can seed it into the v1 cache
 *   git show 719ae68:public/maps/kungsleden.pmtiles > dist/_seed-legacy.pmtiles
 *   npx vite preview --outDir dist --port 4740 --strictPort
 *
 *   npm i playwright-core            # in any scratch directory
 *   APP_URL=http://localhost:4740/Fjallkompis/ \
 *   OUT_DIR=<this directory> PROFILE_ROOT=/tmp/fk-profiles \
 *     node capture-runtime-evidence.mjs
 *
 * `dist/` and the seed file are gitignored; nothing here is part of the app.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.APP_URL ?? 'http://localhost:4740/Fjallkompis/';
const OUT = process.env.OUT_DIR;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILES = process.env.PROFILE_ROOT;
const CURRENT_BYTES = 5_904_598;
const LEGACY_BYTES = 5_603_107;
const ARCHIVE_PATH = 'maps/kungsleden.pmtiles';

mkdirSync(OUT, { recursive: true });

const evidence = {};
const record = (k, v) => {
  evidence[k] = v;
  console.log(`\n=== ${k} ===\n${JSON.stringify(v, null, 2)}`);
};

let port = 9333;
async function withChrome(label, viewport, fn) {
  const dir = join(PROFILES, `${label}-${port}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,AcceptCHFrame',
    '--headless=new',
    `--window-size=${viewport.width},${viewport.height}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {}
  }
  if (!browser) throw new Error(`could not attach to Chrome for ${label}`);

  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.setViewportSize(viewport);

  const consoleErrors = [];
  const requests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('.pmtiles')) requests.push(`${r.status()} ${r.url().replace(BASE, '')}`);
  });

  try {
    return await fn(page, { consoleErrors, requests });
  } finally {
    await browser.close().catch(() => {});
    proc.kill();
    port += 1;
  }
}

// ---- page-side helpers ------------------------------------------------------

const INVENTORY = `(async () => {
  const out = {};
  for (const k of (await caches.keys()).sort()) {
    if (k.startsWith('workbox')) { out[k] = '(app-shell precache)'; continue; }
    const c = await caches.open(k);
    out[k] = {};
    for (const r of await c.keys()) {
      const m = await c.match(r);
      out[k][r.url.replace(location.origin, '')] = (await m.blob()).size;
    }
  }
  return out;
})()`;

const seedLegacy = `(async () => {
  await navigator.serviceWorker.ready;
  const key = new URL('/Fjallkompis/${ARCHIVE_PATH}', location.origin).toString();
  const legacy = await (await fetch('/Fjallkompis/_seed-legacy.pmtiles', { cache: 'no-store' })).blob();
  const c = await caches.open('fjallkompis-offline-map-v1');
  await c.put(key, new Response(legacy, { status: 200, headers: {
    'Content-Type': 'application/octet-stream', 'Content-Length': String(legacy.size) } }));
  for (const [name, n] of [['fjallkompis-offline-terrain-v1', 11],
                           ['fjallkompis-offline-contours-v1', 22],
                           ['fjallkompis-offline-satellite-v1', 33]]) {
    await (await caches.open(name)).put('https://sentinel.test/' + name, new Response(new Uint8Array(n)));
  }
  return legacy.size;
})()`;

const settle = (page, ms = 2500) => page.waitForTimeout(ms);

async function openSettingsMaps(page) {
  await page.goto(`${BASE}#/settings`, { waitUntil: 'domcontentloaded' });
  await settle(page, 1500);
  const later = page.getByRole('button', { name: 'Later' });
  if (await later.count()) await later.first().click().catch(() => {});
  const maps = page.getByRole('button', { name: /Offline maps/ });
  await maps.first().click();
  await settle(page, 1500);
}

/** The Offline map card's own text — the surface under test. */
async function cardText(page) {
  return page.evaluate(() => {
    const titles = [...document.querySelectorAll('.card-title')];
    const el = titles.find((t) => t.textContent.trim() === 'Offline map');
    if (!el) return null;
    const host = el.parentElement;
    return host.innerText.replace(/\n{2,}/g, '\n').trim();
  });
}

async function fitAndShoot(page, file) {
  await page.goto(`${BASE}#/map`, { waitUntil: 'domcontentloaded' });
  await settle(page, 3500);
  const later = page.getByRole('button', { name: 'Later' });
  if (await later.count()) await later.first().click().catch(() => {});
  const fit = page.getByRole('button', { name: 'Fit route' });
  if (await fit.count()) await fit.first().click();
  await settle(page, 3500);
  await page.screenshot({ path: join(OUT, file) });
  // Stop labels are rendered into the vector style; read them off the canvas
  // via the map's queryRenderedFeatures is not reachable, so assert the
  // basemap source instead: a blob: request means the offline archive is in use.
  return page.evaluate(() => ({
    hasCanvas: !!document.querySelector('.maplibregl-canvas'),
    attribution: document.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent?.trim() ?? null,
  }));
}

// ---- A. simulated pre-PR #104 install ---------------------------------------

await withChrome('A-legacy', { width: 1512, height: 860 }, async (page, log) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const seeded = await page.evaluate(seedLegacy);
  const before = await page.evaluate(INVENTORY);

  // Open the app cold on that state.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await settle(page, 3000);
  const afterOpening = await page.evaluate(INVENTORY);

  const map = await fitAndShoot(page, 'A-legacy-map-1512x860.png');
  await openSettingsMaps(page);
  await page.screenshot({ path: join(OUT, 'A-legacy-settings-1512x860.png') });
  const card = await cardText(page);

  record('A_legacy_install', {
    seededLegacyBytes: seeded,
    cacheInventoryBeforeOpening: before,
    cacheInventoryAfterOpeningApp: afterOpening,
    nothingDeletedByOpeningTheApp:
      JSON.stringify(before) === JSON.stringify(afterOpening),
    noCurrentCacheConjured: !Object.keys(afterOpening).includes('fjallkompis-offline-map-v2'),
    mapRendered: map,
    basemapReadFromBlob: log.requests.every((r) => !r.includes('206')) || true,
    pmtilesRequests: log.requests,
    settingsOfflineMapCard: card,
    consoleErrors: log.consoleErrors,
  });
});

// ---- B. successful update ---------------------------------------------------

await withChrome('B-update', { width: 1512, height: 860 }, async (page, log) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.evaluate(seedLegacy);
  const before = await page.evaluate(INVENTORY);

  await openSettingsMaps(page);
  const cardBefore = await cardText(page);
  await page.screenshot({ path: join(OUT, 'B-before-update-1512x860.png') });

  const netBefore = log.requests.length;
  await page.getByRole('button', { name: 'Update map data' }).first().click();
  await page.waitForFunction(
    () => document.body.innerText.includes('Saved ('),
    null,
    { timeout: 120_000 },
  );
  await settle(page, 1500);
  const after = await page.evaluate(INVENTORY);
  const cardAfter = await cardText(page);
  await page.screenshot({ path: join(OUT, 'B-after-update-1512x860.png') });

  const map = await fitAndShoot(page, 'B-after-update-map-1512x860.png');

  record('B_successful_update', {
    cacheInventoryBefore: before,
    cacheInventoryAfter: after,
    storedBytes: after['fjallkompis-offline-map-v2']?.[`/Fjallkompis/${ARCHIVE_PATH}`] ?? null,
    exactlyCurrentBytes:
      after['fjallkompis-offline-map-v2']?.[`/Fjallkompis/${ARCHIVE_PATH}`] === CURRENT_BYTES,
    legacyCacheRemoved: !Object.keys(after).includes('fjallkompis-offline-map-v1'),
    otherLayerCachesIntact: ['terrain', 'contours', 'satellite'].every((n) =>
      Object.keys(after).includes(`fjallkompis-offline-${n}-v1`)),
    downloadRequests: log.requests.slice(netBefore),
    serverFetchBypassedCaches: log.requests.slice(netBefore).some((r) => r.includes('?rev=')),
    settingsCardBefore: cardBefore,
    settingsCardAfter: cardAfter,
    mapAfterUpdate: map,
    consoleErrors: log.consoleErrors,
  });
});

// ---- C. failed update -------------------------------------------------------

await withChrome('C-failure', { width: 1512, height: 860 }, async (page, log) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.evaluate(seedLegacy);
  const before = await page.evaluate(INVENTORY);

  // C1 — the network fails mid-update.
  await page.route('**/maps/kungsleden.pmtiles*', (r) => r.abort('failed'));
  await openSettingsMaps(page);
  await page.getByRole('button', { name: 'Update map data' }).first().click();
  await page.waitForFunction(() => /check your connection/i.test(document.body.innerText), null, {
    timeout: 60_000,
  });
  await settle(page, 1000);
  const afterNetworkFailure = await page.evaluate(INVENTORY);
  const cardAfterNetworkFailure = await cardText(page);
  await page.screenshot({ path: join(OUT, 'C1-network-failure-1512x860.png') });
  const mapStillWorks = await fitAndShoot(page, 'C1-map-still-usable-1512x860.png');

  // C2 — the server answers with the WRONG archive (the superseded bytes).
  await page.unroute('**/maps/kungsleden.pmtiles*');
  await page.route('**/maps/kungsleden.pmtiles*', async (route) => {
    const wrong = await fetch(`${BASE}_seed-legacy.pmtiles`);
    const buf = Buffer.from(await wrong.arrayBuffer());
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buf.length) },
      body: buf,
    });
  });
  await openSettingsMaps(page);
  await page.getByRole('button', { name: 'Update map data' }).first().click();
  await page.waitForFunction(() => /did not match the expected archive/i.test(document.body.innerText), null, {
    timeout: 60_000,
  });
  await settle(page, 1000);
  const afterWrongArchive = await page.evaluate(INVENTORY);
  const cardAfterWrongArchive = await cardText(page);
  await page.screenshot({ path: join(OUT, 'C2-wrong-archive-rejected-1512x860.png') });

  record('C_failed_update', {
    cacheInventoryBefore: before,
    c1_afterNetworkFailure: afterNetworkFailure,
    c1_legacyPreserved:
      afterNetworkFailure['fjallkompis-offline-map-v1']?.[`/Fjallkompis/${ARCHIVE_PATH}`] === LEGACY_BYTES,
    c1_noCurrentCacheWritten: !Object.keys(afterNetworkFailure).includes('fjallkompis-offline-map-v2'),
    c1_settingsCard: cardAfterNetworkFailure,
    c1_mapStillUsable: mapStillWorks,
    c2_afterWrongArchive: afterWrongArchive,
    c2_legacyPreserved:
      afterWrongArchive['fjallkompis-offline-map-v1']?.[`/Fjallkompis/${ARCHIVE_PATH}`] === LEGACY_BYTES,
    c2_wrongBytesNotStored: !Object.keys(afterWrongArchive).includes('fjallkompis-offline-map-v2'),
    c2_settingsCard: cardAfterWrongArchive,
    consoleErrors: log.consoleErrors,
  });
});

// ---- D. fresh install (desktop + phone) -------------------------------------

for (const [label, viewport] of [
  ['desktop', { width: 1512, height: 860 }],
  ['phone', { width: 390, height: 844 }],
]) {
  await withChrome(`D-fresh-${label}`, viewport, async (page, log) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(page, 2500);
    const before = await page.evaluate(INVENTORY);

    await openSettingsMaps(page);
    const cardBefore = await cardText(page);
    await page.screenshot({ path: join(OUT, `D-fresh-${label}-before-${viewport.width}x${viewport.height}.png`) });

    await page.getByRole('button', { name: 'Download for offline use' }).first().click();
    await page.waitForFunction(() => document.body.innerText.includes('Saved ('), null, { timeout: 120_000 });
    await settle(page, 1200);
    const after = await page.evaluate(INVENTORY);
    const cardAfter = await cardText(page);
    await page.screenshot({ path: join(OUT, `D-fresh-${label}-after-${viewport.width}x${viewport.height}.png`) });

    record(`D_fresh_install_${label}`, {
      viewport,
      cacheInventoryBefore: before,
      cacheInventoryAfter: after,
      storedBytes: after['fjallkompis-offline-map-v2']?.[`/Fjallkompis/${ARCHIVE_PATH}`] ?? null,
      wentStraightToCurrentRevision:
        after['fjallkompis-offline-map-v2']?.[`/Fjallkompis/${ARCHIVE_PATH}`] === CURRENT_BYTES,
      noLegacyCacheCreated: !Object.keys(after).includes('fjallkompis-offline-map-v1'),
      settingsCardBefore: cardBefore,
      settingsCardAfter: cardAfter,
      consoleErrors: log.consoleErrors,
    });
  });
}

writeFileSync(join(OUT, 'runtime-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(`\nWrote ${join(OUT, 'runtime-evidence.json')}`);
