#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { MAP_ASSETS, mapAssetPath } from '../src/map/mapCatalog.mjs';
import {
  STORE_CAPTURE_DATE,
  STORE_PROFILES,
  STORE_SCENES,
  auditPinnedBackup,
  captureRestoreBuffer,
  parseStoreCaptureArgs,
  privacyFindings,
  sha256,
  validatePng,
} from './lib/store-capture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseStoreCaptureArgs(process.argv.slice(2));

if (args.help) {
  console.log('Usage: npm run capture:store -- --backup /safe/path/fjallkompis-store-demo-sanitized.fjallkompis.zip [--output artifacts/store-capture] [--skip-build] [--no-captions]');
  process.exit(0);
}
if (!args.backup) throw new Error('Supply the sanitized demo backup with --backup or STORE_DEMO_BACKUP.');

const backupPath = path.resolve(args.backup);
const outputRoot = path.resolve(root, args.output);
const backupAudit = auditPinnedBackup(backupPath);
const restoreBuffer = captureRestoreBuffer(backupPath);
const baseSha = process.env.STORE_CAPTURE_BASE_SHA ?? execFileSync(
  'git',
  ['merge-base', 'HEAD', 'origin/main'],
  { cwd: root, encoding: 'utf8' },
).trim();

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: root, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${commandArgs.join(' ')} failed (${signal ?? code}).`));
    });
  });
}

async function verifyMapArchives() {
  for (const id of ['vector', 'terrain', 'contours', 'satellite']) {
    const asset = MAP_ASSETS[id];
    const file = path.join(root, 'public', mapAssetPath(asset));
    const bytes = fs.readFileSync(file);
    if (bytes.byteLength !== asset.revision.bytes || sha256(bytes) !== asset.revision.sha256) {
      throw new Error(`${id} archive is not the current catalog revision. Expected ${asset.revision.id}; refresh the ignored local map asset first.`);
    }
  }
}

await verifyMapArchives();
if (!args.skipBuild) await run('npm', ['run', 'build', '--', '--mode', 'store-capture']);

const port = Number(process.env.STORE_CAPTURE_PORT ?? 4319);
const baseUrl = `http://127.0.0.1:${port}/Fjallkompis/`;
const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Preview did not start: ${lastError?.message ?? 'timeout'}`);
}

async function launchBrowser() {
  const executablePath = process.env.STORE_CAPTURE_BROWSER_PATH;
  if (executablePath) return chromium.launch({ headless: true, executablePath });
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' });
  } catch (chromeError) {
    try {
      return await chromium.launch({ headless: true });
    } catch {
      throw new Error(`No capture browser is available. Install Chrome or run "npx playwright install chromium". Original error: ${chromeError.message}`);
    }
  }
}

function fixedClockScript(iso) {
  const now = new Date(iso).valueOf();
  return ({ now }) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...values) {
        super(...(values.length === 0 ? [now] : values));
      }
      static now() { return now; }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    globalThis.Date = FixedDate;
  };
}

async function seedOfflineMaps(page) {
  const assets = ['vector', 'terrain', 'contours', 'satellite'].map((id) => {
    const asset = MAP_ASSETS[id];
    return { id, url: new URL(mapAssetPath(asset), baseUrl).toString(), cacheName: asset.cacheName, expectedBytes: asset.revision.bytes };
  });
  const result = await page.evaluate(async (items) => {
    const seeded = [];
    for (const item of items) {
      const response = await fetch(item.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${item.id} fetch failed: ${response.status}`);
      const blob = await response.blob();
      if (blob.size !== item.expectedBytes) throw new Error(`${item.id} size mismatch: ${blob.size}`);
      const cache = await caches.open(item.cacheName);
      await cache.put(item.url, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(blob.size) } }));
      seeded.push({ id: item.id, bytes: blob.size });
    }
    return seeded;
  }, assets);
  if (result.length !== assets.length) throw new Error('Not every optional map archive was seeded.');
}

async function restoreDemo(page) {
  await page.goto(`${baseUrl}#/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await seedOfflineMaps(page);
  await page.getByRole('button', { name: /Backup & restore/ }).click();
  await page.locator('input[type="file"][accept*="fjallkompis"]').setInputFiles({
    name: 'fjallkompis-store-demo-sanitized.fjallkompis.zip',
    mimeType: 'application/zip',
    buffer: restoreBuffer,
  });
  const dialog = page.getByRole('dialog', { name: 'Replace this device’s data?' });
  await page.waitForFunction(() => Boolean(document.querySelector('[role="dialog"]') || document.querySelector('.banner-warn')));
  if (!(await dialog.isVisible())) {
    const notice = await page.locator('.banner-warn').innerText().catch(() => 'No restore feedback was rendered.');
    throw new Error(`The product restore flow rejected the pinned backup: ${notice}`);
  }
  await dialog.getByRole('button', { name: 'Replace and restore' }).click();
  await page.getByText(/Backup restored — trip data and 4 documents replaced/).waitFor();
}

async function settle(page, { map = false } = {}) {
  const lifecycleToast = page.locator('.pwa-toast').first();
  if (await lifecycleToast.isVisible().catch(() => false)) {
    const dismiss = lifecycleToast.getByRole('button', { name: /Later|Dismiss|Close installation prompt/ }).first();
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll('dialog,[role="dialog"],[role="alertdialog"],.map-popover').forEach((node) => {
      if (node instanceof HTMLElement && node.offsetParent !== null) throw new Error('Unexpected modal/popover remains open.');
    });
    const scrolling = document.querySelector('main');
    if (scrolling) scrolling.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  if (map) {
    await page.waitForFunction(() => {
      const mapHandle = globalThis.__fjallkompisStoreCaptureMap;
      // Final Map marks the canvas ready after its post-load idle frame. Its
      // satellite source can retain non-visible background tile bookkeeping,
      // so `areTilesLoaded()` is no longer the visual-ready contract.
      const mapView = document.querySelector('.mapview[data-map-ready="true"]');
      return Boolean(mapView && mapHandle && mapHandle.loaded() && !mapHandle.isMoving());
    }, null, { timeout: 60_000 });
    await page.waitForFunction(() => !document.querySelector('.map-note--warn'), null, { timeout: 10_000 });
  }
  await page.waitForFunction(() => document.readyState === 'complete');
}

async function openScene(page, scene) {
  await page.evaluate((hash) => { location.hash = hash; }, scene.hash);
  await page.waitForFunction((hash) => location.hash === hash, scene.hash);
  const destinationHeading = {
    '01-today': 'Today',
    '02-map-terrain': 'Map',
    '03-map-satellite': 'Map',
    '04-stage-guide': 'Stages & highlights',
    '05-packing': 'Packing',
    '06a-trail-readiness': 'Settings',
    '06b-wallet': 'Wallet',
  }[scene.id];
  await page.getByRole('heading', { name: destinationHeading, exact: true }).waitFor();
  if (scene.setup === 'stage-guide') {
    await page.getByRole('heading', { name: 'Stages & highlights', exact: true }).waitFor();
    const firstGuide = page.locator('.stage-card').first().getByRole('button', { name: /Stage guide/ });
    await firstGuide.click();
    await page.getByRole('region', { name: /Stage 1 guide/ }).waitFor();
    await page.locator('.stage-card').first().scrollIntoViewIfNeeded();
  } else if (scene.setup === 'trail-readiness') {
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    const readiness = page.getByRole('button', { name: /Trail Readiness/ });
    await readiness.click();
    await readiness.scrollIntoViewIfNeeded();
  } else if (scene.map === 'satellite') {
    await page.getByRole('heading', { name: 'Map', exact: true }).waitFor();
    await settle(page, { map: true });
    await page.getByRole('button', { name: /Choose map layer/ }).click();
    await page.getByRole('radio', { name: /Satellite/ }).click();
    await page.waitForFunction(() => {
      const mapHandle = globalThis.__fjallkompisStoreCaptureMap;
      return mapHandle?.getLayoutProperty('satellite', 'visibility') === 'visible';
    });
  }
  await settle(page, { map: Boolean(scene.map) });
  if (scene.setup === 'stage-guide') {
    await page.locator('.stage-card').first().getByText('Trail character', { exact: true })
      .evaluate((label) => label.scrollIntoView({ block: 'center', behavior: 'auto' }));
  }
  if (scene.setup === 'trail-readiness') {
    await page.getByRole('button', { name: /Trail Readiness/ }).scrollIntoViewIfNeeded();
  }
}

async function assertScene(page, scene) {
  const bodyText = await page.locator('body').innerText();
  const findings = privacyFindings(bodyText, `${scene.id} visible DOM`);
  if (findings.length > 0) throw new Error(`Privacy check failed:\n- ${findings.join('\n- ')}`);
  if (await page.locator('[aria-busy="true"],.loading,.spinner').count()) throw new Error(`${scene.id}: loading UI remains visible.`);
  if (await page.locator('body').evaluate((body) => body.scrollWidth > body.clientWidth)) throw new Error(`${scene.id}: horizontal page overflow detected.`);
  const expectations = {
    '01-today': ['Today'],
    '02-map-terrain': ['Map'],
    '03-map-satellite': ['Map'],
    '04-stage-guide': ['Trail character'],
    '05-packing': ['Packing', 'Packing progress'],
    '06a-trail-readiness': ['Trail Readiness', 'Default basemap', 'Terrain relief', 'Satellite', 'Packing'],
    '06b-wallet': ['Wallet'],
  };
  for (const expected of expectations[scene.id]) {
    if ((await page.getByText(expected, { exact: false }).count()) === 0) {
      throw new Error(`${scene.id}: expected content "${expected}" is missing.`);
    }
  }
}

async function captionVariant(browser, profile, sourceBuffer, caption, targetPath) {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor });
  const page = await context.newPage();
  const dataUrl = `data:image/png;base64,${sourceBuffer.toString('base64')}`;
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#edf2ed}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#173b32;display:grid;grid-template-rows:12% 88%}
    header{display:flex;align-items:center;justify-content:center;padding:2.2% 7%;font-size:clamp(24px,5.8vw,62px);font-weight:760;letter-spacing:-.025em;text-align:center}
    .shot{min-height:0;padding:0 3.2% 3.2%;display:flex;justify-content:center}
    img{display:block;height:100%;max-width:100%;object-fit:contain;border-radius:clamp(10px,2vw,24px);box-shadow:0 12px 36px rgba(19,58,48,.16)}
  </style></head><body><header></header><div class="shot"><img alt=""></div></body></html>`);
  await page.locator('header').evaluate((header, text) => { header.textContent = text; }, caption);
  await page.locator('img').evaluate((img, src) => { img.src = src; }, dataUrl);
  await page.locator('img').evaluate((img) => img.decode());
  const buffer = await page.screenshot({ path: targetPath, animations: 'disabled' });
  await context.close();
  return buffer;
}

let browser;
try {
  await waitForServer();
  browser = await launchBrowser();
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputs = [];
  for (const profile of STORE_PROFILES) {
    const profileDir = path.join(outputRoot, profile.id);
    fs.mkdirSync(profileDir, { recursive: true });
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-GB',
      timezoneId: 'Europe/Amsterdam',
      serviceWorkers: 'allow',
    });
    await context.addInitScript(fixedClockScript(STORE_CAPTURE_DATE), { now: new Date(STORE_CAPTURE_DATE).valueOf() });
    await context.addInitScript(() => {
      sessionStorage.setItem('fjallkompis.installNudgeDismissed.v1', '1');
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        console.error(`[browser:${profile.id}] ${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => console.error(`[browser:${profile.id}] ${error.message}`));
    await restoreDemo(page);
    for (const scene of STORE_SCENES) {
      console.log(`[capture] ${profile.id}/${scene.id}`);
      await openScene(page, scene);
      await assertScene(page, scene);
      const relativeFile = `${profile.id}/${scene.id}.png`;
      const absoluteFile = path.join(outputRoot, relativeFile);
      if (privacyFindings(relativeFile, 'output filename').length) throw new Error(`${relativeFile}: unsafe filename.`);
      const buffer = await page.screenshot({ path: absoluteFile, animations: 'disabled', caret: 'hide', scale: 'device' });
      const dimensions = validatePng(buffer, profile, relativeFile);
      outputs.push({ profile: profile.id, scene: scene.id, title: scene.title, file: relativeFile, ...dimensions, bytes: buffer.byteLength, sha256: sha256(buffer), privacy: 'visible-dom-pass' });
      if (args.captions && profile.id === 'phone' && ['01-today', '02-map-terrain', '04-stage-guide'].includes(scene.id)) {
        const captionFile = `captioned/${profile.id}/${scene.id}.png`;
        const captionPath = path.join(outputRoot, captionFile);
        fs.mkdirSync(path.dirname(captionPath), { recursive: true });
        const captionBuffer = await captionVariant(browser, profile, buffer, scene.caption, captionPath);
        validatePng(captionBuffer, profile, captionFile);
        outputs.push({ profile: profile.id, scene: `${scene.id}-captioned`, title: `${scene.title} (captioned comparison)`, file: captionFile, ...dimensions, bytes: captionBuffer.byteLength, sha256: sha256(captionBuffer), privacy: 'derived-from-checked-source' });
      }
    }
    await context.close();
  }

  const manifest = {
    schemaVersion: 1,
    source: { baseSha, backupSha256: backupAudit.sha256, fixedDate: STORE_CAPTURE_DATE },
    browser: { engine: 'chromium', version: browser.version() },
    profiles: STORE_PROFILES,
    privacy: {
      guarantees: ['Pinned audited backup SHA-256', 'JSON metadata and visible DOM pattern checks', 'Output filename and manifest string checks'],
      limitations: ['No OCR is performed on generated screenshots or Wallet image attachments', 'Pattern checks cannot prove the absence of every possible personal name'],
    },
    outputs,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestFindings = privacyFindings(manifestText, 'manifest');
  if (manifestFindings.length) throw new Error(`Manifest privacy check failed:\n- ${manifestFindings.join('\n- ')}`);
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), manifestText);
  console.log(`Store capture complete: ${outputs.length} PNGs in ${outputRoot}`);
} finally {
  await browser?.close().catch(() => {});
  preview.kill('SIGTERM');
}
