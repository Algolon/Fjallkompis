#!/usr/bin/env node
/**
 * Compose reusable Google Play feature-graphic candidates from the audited,
 * generated Store screenshots. This never touches the product bundle.
 *
 *   npm run generate:store-feature-graphics
 *   npm run generate:store-feature-graphics -- --source artifacts/store-capture --output artifacts/store-feature-graphics
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { pngDimensions, privacyFindings } from './lib/store-capture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaults = { source: 'artifacts/store-capture', output: 'artifacts/store-feature-graphics' };

function parseArgs(argv) {
  const out = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source') out.source = argv[++i];
    else if (argv[i] === '--output') out.output = argv[++i];
    else if (argv[i] === '--help') {
      console.log('Usage: npm run generate:store-feature-graphics -- [--source artifacts/store-capture] [--output artifacts/store-feature-graphics]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(root, args.source);
const outputRoot = path.resolve(root, args.output);
const file = (relative) => path.join(sourceRoot, relative);

function dataUrl(absolutePath) {
  return `data:image/png;base64,${fs.readFileSync(absolutePath).toString('base64')}`;
}

function checkedSources() {
  const manifestPath = file('manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing Store capture manifest: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!/^[a-f\d]{64}$/.test(manifest.source?.backupSha256 ?? '')) throw new Error('Store capture manifest has no pinned backup SHA-256.');
  const required = ['phone/01-today.png', 'phone/02-map-terrain.png', 'phone/06a-trail-readiness.png'];
  const outputs = new Map(manifest.outputs.map((output) => [output.file, output]));
  for (const relative of required) {
    const output = outputs.get(relative);
    if (!output || output.privacy !== 'visible-dom-pass') throw new Error(`${relative} is not a privacy-checked Store capture.`);
    if (!fs.existsSync(file(relative))) throw new Error(`Missing Store capture: ${file(relative)}`);
  }
  return {
    manifest,
    today: dataUrl(file('phone/01-today.png')),
    terrain: dataUrl(file('phone/02-map-terrain.png')),
    readiness: dataUrl(file('phone/06a-trail-readiness.png')),
    mark: dataUrl(path.join(root, 'assets/brand/fjallkompis-mark-512.png')),
  };
}

function shell({ label, title, subtitle, body }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} html,body{margin:0;width:1024px;height:500px;overflow:hidden}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#f1f4ed;background:#203f33}
    .canvas{width:1024px;height:500px;position:relative;overflow:hidden;background:#dce4d8}
    .topo{position:absolute;inset:0;opacity:.23;background-image:radial-gradient(ellipse at 10% 15%,transparent 0 53px,#d4dacd 54px 57px,transparent 58px 82px),radial-gradient(ellipse at 75% 70%,transparent 0 73px,#8ba296 74px 77px,transparent 78px 108px),repeating-radial-gradient(ellipse at 48% 42%,transparent 0 23px,#6d897b 24px 26px,transparent 27px 47px);background-size:330px 210px,390px 270px,510px 350px;transform:rotate(-9deg) scale(1.2)}
    .brand{position:absolute;left:56px;top:42px;display:flex;align-items:center;gap:13px;font-size:20px;font-weight:750;letter-spacing:.1em;text-transform:uppercase;color:#e6ede3}.brand img{width:31px;height:31px}
    .eyebrow{font-size:14px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:#b8d0c5;margin-bottom:13px}.copy{position:absolute;left:56px;top:128px;z-index:3;width:410px}.copy h1{margin:0;font-size:52px;line-height:.98;letter-spacing:-.045em}.copy p{margin:18px 0 0;font-size:21px;line-height:1.32;color:#d4ded6}.rule{width:68px;height:4px;background:#c89547;border-radius:4px;margin-top:25px}
    .label{position:absolute;left:56px;bottom:38px;z-index:3;font-size:13px;font-weight:700;letter-spacing:.08em;color:#c4d3ca;text-transform:uppercase}.surface{position:absolute;overflow:hidden;border-radius:27px;box-shadow:0 24px 65px rgba(14,34,27,.32);border:1px solid rgba(255,255,255,.37);background:#e6ede3}.surface img{display:block;width:100%;height:100%;object-fit:cover}.soft{position:absolute;inset:0;background:linear-gradient(90deg,rgba(28,61,48,.97) 0%,rgba(31,63,51,.86) 42%,rgba(31,63,51,.08) 74%,rgba(31,63,51,0) 100%)}
  </style></head><body><main class="canvas" aria-label="${label}"><div class="topo"></div>${body}</main></body></html>`;
}

function concepts(s) {
  return [
    {
      file: '01-today-hero.png',
      safeText: 'Fjallkompis Kungsleden companion Your hike ready offline Plan navigate prepare',
      html: shell({
        label: 'Fjallkompis Today hero feature graphic',
        body: `<div class="soft"></div><div class="brand"><img src="${s.mark}" alt="">Fjallkompis</div><section class="copy"><div class="eyebrow">Kungsleden companion</div><h1>Your hike,<br>ready offline.</h1><p>Plan each day, keep your route close and stay prepared on the trail.</p><div class="rule"></div></section><div class="surface" style="right:67px;top:40px;width:317px;height:420px"><img src="${s.today}" alt="Real Fjallkompis Today screen" style="object-position:50% 10%"></div><div class="label">Plan · navigate · prepare</div>`,
      }),
    },
    {
      file: '02-offline-maps.png',
      safeText: 'Fjallkompis Offline maps Know the route Keep moving Built for the Kungsleden',
      html: shell({
        label: 'Fjallkompis offline maps feature graphic',
        body: `<div class="surface" style="right:-12px;top:-12px;width:610px;height:524px;border-radius:0"><img src="${s.terrain}" alt="Real Fjallkompis terrain map" style="object-position:50% 50%"></div><div class="soft" style="background:linear-gradient(90deg,rgba(25,55,43,.98) 0%,rgba(25,55,43,.9) 48%,rgba(25,55,43,.21) 76%,rgba(25,55,43,0) 100%)"></div><div class="brand"><img src="${s.mark}" alt="">Fjallkompis</div><section class="copy" style="width:460px"><div class="eyebrow">Offline maps</div><h1>Know the route.<br>Keep moving.</h1><p>Clear terrain and your Kungsleden route, even when signal fades.</p><div class="rule"></div></section><div class="label">Built for the Kungsleden</div>`,
      }),
    },
    {
      file: '03-companion-overview.png',
      safeText: 'Fjallkompis Practical trail companion Plan less Hike prepared Kungsleden offline-first',
      html: shell({
        label: 'Fjallkompis companion overview feature graphic',
        body: `<div style="position:absolute;inset:0;background:linear-gradient(120deg,#254839,#41695b 58%,#d5ded3 58%)"></div><div class="brand"><img src="${s.mark}" alt="">Fjallkompis</div><section class="copy" style="top:132px;width:355px"><div class="eyebrow">Practical trail companion</div><h1>Plan less.<br>Hike prepared.</h1><p>One calm place for your day, route and offline readiness.</p></section><div class="surface" style="right:312px;top:96px;width:245px;height:350px;transform:rotate(-4deg)"><img src="${s.today}" alt="Real Fjallkompis Today screen" style="object-position:50% 11%"></div><div class="surface" style="right:62px;top:148px;width:275px;height:268px;transform:rotate(3deg)"><img src="${s.readiness}" alt="Real Fjallkompis Trail Readiness screen" style="object-position:50% 28%"></div><div class="label">Kungsleden · offline-first</div>`,
      }),
    },
  ];
}

async function main() {
  const sources = checkedSources();
  fs.mkdirSync(outputRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const results = [];
  try {
    for (const concept of concepts(sources)) {
      if (privacyFindings(concept.safeText, concept.file).length) throw new Error(`${concept.file}: unsafe generated copy.`);
      const context = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1, colorScheme: 'light' });
      const page = await context.newPage();
      await page.setContent(concept.html, { waitUntil: 'load' });
      await page.locator('img').last().evaluate(async (image) => image.decode());
      const target = path.join(outputRoot, concept.file);
      const bytes = await page.screenshot({ path: target, animations: 'disabled', caret: 'hide' });
      const dimensions = pngDimensions(bytes);
      if (dimensions.width !== 1024 || dimensions.height !== 500) throw new Error(`${concept.file}: expected 1024×500, got ${dimensions.width}×${dimensions.height}.`);
      if (bytes.byteLength > 15_000_000) throw new Error(`${concept.file}: exceeds Google Play's 15 MB limit.`);
      results.push({ file: concept.file, ...dimensions, bytes: bytes.byteLength });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const manifest = {
    schemaVersion: 1,
    source: { captureManifest: path.relative(root, path.join(sourceRoot, 'manifest.json')), baseSha: sources.manifest.source.baseSha, backupSha256: sources.manifest.source.backupSha256 },
    output: { width: 1024, height: 500, format: 'png', maxBytes: 15_000_000 },
    candidates: results,
  };
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Feature graphics complete: ${results.length} PNGs in ${outputRoot}`);
}

await main();
