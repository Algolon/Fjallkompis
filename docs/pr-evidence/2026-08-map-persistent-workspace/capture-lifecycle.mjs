/**
 * Persistent-Map-workspace lifecycle evidence (P1).
 *
 * Drives a real Chromium against the dev server and records, from the app's
 * own dev instrumentation (window.__fjallkompisMapWorkspace +
 * data-map-lifecycle), the two claims the architecture makes:
 *
 *  1. BACKGROUND INITIALIZATION: with the app parked on Today, the Map
 *     workspace mounts in the deferred startup phase and reaches first
 *     useful render (mapReady) without any Map navigation — so the entire
 *     construction chain (archive resolution → MapLibre constructor →
 *     style/tile load → first useful render) happens OFF the tap path.
 *
 *  2. PERSISTENCE: a full tab tour (Map → Today → Map → Guide → Map → Plan
 *     → Map → Settings → Map) performs 5 activations and 4 deactivations
 *     with the MapLibre constructor count still exactly 1.
 *
 * A second scenario races the user against the background init: navigate to
 * #/map immediately on load, before the idle mount fires — the activation
 * must join the in-flight workspace (activationsWhileInitializing = 1) and
 * still end the session at constructor count 1.
 *
 * Numbers recorded here are from headless desktop Chromium — they prove the
 * ARCHITECTURE (what work moved off the tap path), not Samsung milliseconds.
 *
 * Reproduce:
 *   npm run dev -- --port 4750 --strictPort
 *   # point PLAYWRIGHT_MODULE at any playwright install if none is local
 *   APP_URL=http://localhost:4750/Fjallkompis/ OUT_DIR=<this dir> \
 *   node capture-lifecycle.mjs
 */
import { writeFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.APP_URL ?? 'http://localhost:4750/Fjallkompis/';
const OUT = process.env.OUT_DIR ?? dirname(fileURLToPath(import.meta.url));

const snapshot = (page) =>
  page.evaluate(() => {
    const ws = document.querySelector('.map-workspace');
    const view = document.querySelector('.mapview');
    return {
      evidence: window.__fjallkompisMapWorkspace ?? null,
      workspaceState: ws ? ws.dataset.mapWorkspace : 'unmounted',
      ariaHidden: ws?.getAttribute('aria-hidden') ?? null,
      inert: ws ? ws.inert : null,
      mapReadyAttr: view?.dataset.mapReady ?? null,
      lifecycle: view?.dataset.mapLifecycle ? JSON.parse(view.dataset.mapLifecycle) : null,
    };
  });

const go = async (page, hash) => {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  // Let React commit the navigation.
  await page.waitForTimeout(120);
};

async function scenarioBackgroundThenTour(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const t0 = Date.now();
  await page.goto(`${BASE}#/today`);
  // The app sits on Today; the workspace must mount and become ready with
  // NO Map navigation.
  await page.waitForFunction(() => window.__fjallkompisMapWorkspace?.ready === true, null, {
    timeout: 60_000,
  });
  const readyWallMs = Date.now() - t0;
  const afterBackgroundInit = await snapshot(page);

  // Full tour: 5 activations, 4 deactivations, constructor count must not move.
  const tour = ['#/map', '#/today', '#/map', '#/guide', '#/map', '#/plan', '#/map', '#/settings', '#/map'];
  const activationLatencies = [];
  for (const hash of tour) {
    if (hash === '#/map') {
      const t = Date.now();
      await go(page, hash);
      await page.waitForSelector('.map-workspace.is-active', { timeout: 5_000 });
      await page.waitForSelector('.mapview[data-map-ready="true"]', { timeout: 5_000 });
      activationLatencies.push(Date.now() - t);
    } else {
      await go(page, hash);
    }
  }
  const afterTour = await snapshot(page);
  await page.close();
  return { readyWallMs, afterBackgroundInit, activationLatencies, afterTour, consoleErrors };
}

async function scenarioTapBeforeReady(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}#/today`);
  // Beat the idle mount: go to the Map immediately.
  await page.evaluate(() => {
    window.location.hash = '#/map';
  });
  await page.waitForSelector('.map-workspace.is-active', { timeout: 10_000 });
  const duringInit = await snapshot(page);
  await page.waitForFunction(() => window.__fjallkompisMapWorkspace?.ready === true, null, {
    timeout: 60_000,
  });
  // Leave and return once — still one constructor.
  await go(page, '#/today');
  await go(page, '#/map');
  const final = await snapshot(page);
  await page.close();
  return { duringInit, final };
}

const browser = await chromium.launch();
const result = {
  capturedAt: new Date().toISOString(),
  base: BASE,
  scenarioBackgroundThenTour: await scenarioBackgroundThenTour(browser),
  scenarioTapBeforeReady: await scenarioTapBeforeReady(browser),
};
await browser.close();

// ---- Assertions: the capture FAILS loudly if the architecture regresses ----
const a = result.scenarioBackgroundThenTour;
const assert = (cond, msg) => {
  if (!cond) {
    console.error(`ASSERTION FAILED: ${msg}`);
    process.exitCode = 1;
  }
};
assert(a.afterBackgroundInit.evidence.mapConstructors === 1, 'one constructor after background init');
assert(a.afterBackgroundInit.evidence.activations === 0, 'ready was reached with zero activations');
assert(a.afterBackgroundInit.workspaceState === 'inactive', 'workspace inactive while Today shows');
assert(a.afterBackgroundInit.ariaHidden === 'true' && a.afterBackgroundInit.inert === true,
  'inactive workspace is aria-hidden and inert');
assert(a.afterTour.evidence.mapConstructors === 1, 'STILL one constructor after the 9-stop tour');
assert(a.afterTour.evidence.workspaceMounts === 1, 'one workspace mount for the whole session');
assert(a.afterTour.evidence.activations === 5 && a.afterTour.evidence.deactivations === 4,
  '5 activations / 4 deactivations');
assert(a.afterTour.evidence.activationsWhileReady === 5, 'every tap found the map already ready');
assert(a.afterTour.workspaceState === 'active' && a.afterTour.inert === false,
  'active workspace is interactive');
const b = result.scenarioTapBeforeReady;
assert(b.final.evidence.mapConstructors === 1, 'racing the init still yields one constructor');
assert(b.duringInit.evidence.activationsWhileInitializing >= 1
  || b.duringInit.evidence.activationsWhileReady >= 1,
  'the early tap activated the same (possibly in-flight) workspace');

writeFileSync(join(OUT, 'lifecycle-results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  ok: process.exitCode !== 1,
  readyWallMs: a.readyWallMs,
  activationLatenciesMs: a.activationLatencies,
  finalEvidence: a.afterTour.evidence,
  raceFinalEvidence: b.final.evidence,
}, null, 2));
