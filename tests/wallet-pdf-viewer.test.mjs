/**
 * The in-app PDF viewer — Wallet PDFs render INSIDE Fjallkompis on every
 * platform (browser, installed PWA, Capacitor Android WebView), through one
 * shared surface: src/components/WalletPdfViewer.tsx on top of pdf.js.
 *
 * Three layers are exercised here:
 *
 *   1. REAL DOCUMENT BEHAVIOUR — src/pdf/pdfDocumentSource.mjs run against
 *      the actual pdfjs-dist build with real bytes: a multi-page PDF opens
 *      and reports its pages; corrupt bytes, empty bytes and non-PDF bytes
 *      collapse to the one honest 'unreadable' outcome the viewer's error
 *      state shows. No mocks — if a pdfjs upgrade changes parsing behaviour,
 *      this is where it surfaces.
 *   2. SIZING/MEMORY ARITHMETIC — src/pdf/pdfViewerCore.mjs, the numbers the
 *      viewer draws with: fit-to-width, the per-page canvas pixel budget
 *      (Wallet files may be 20 MB; a phone must never freeze over one),
 *      zoom clamping, and the lazy render window.
 *   3. ARCHITECTURE GUARDS — source contracts pinning what node cannot run:
 *      the renderer loads lazily, the worker is bundled locally (no CDN, no
 *      runtime network), every build precaches the pdf assets, and the
 *      viewer keeps the app-shell contract (title, close, honest error with
 *      the existing save path — never an external hand-off).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { openPdfDocument } from '../src/pdf/pdfDocumentSource.mjs';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  PAGE_PIXEL_BUDGET,
  clampZoom,
  fitToWidthScale,
  renderGeometry,
  renderWindow,
} from '../src/pdf/pdfViewerCore.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const codeOf = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---- A real multi-page PDF, assembled byte-honestly in the test ---------------

/** A minimal but VALID two-page PDF (correct xref), like a stored ticket. */
function buildTwoPagePdf() {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>\nendobj\n',
    '4 0 obj\n<< /Length 60 >>\nstream\nBT /F1 24 Tf 72 770 Td (Fjallkompis page one) Tj ET\nendstream\nendobj\n',
    '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>\nendobj\n',
    '6 0 obj\n<< /Length 60 >>\nstream\nBT /F1 24 Tf 72 770 Td (Fjallkompis page two) Tj ET\nendstream\nendobj\n',
    '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (const o of objects) {
    offsets.push(out.length);
    out += o;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

test('a multi-page PDF opens and exposes every page with real dimensions', async () => {
  const result = await openPdfDocument(pdfjs, buildTwoPagePdf());
  assert.equal(result.ok, true);
  assert.equal(result.doc.numPages, 2, 'both pages are reachable, not just the first');
  const page1 = await result.doc.getPage(1);
  const page2 = await result.doc.getPage(2);
  assert.equal(page1.getViewport({ scale: 1 }).width, 595);
  assert.equal(page2.getViewport({ scale: 1 }).height, 842);
  const text = await page2.getTextContent();
  assert.match(text.items.map((i) => i.str).join(' '), /page two/,
    'page content is genuinely parsed, not merely counted');
  await result.destroy();
});

test('corrupt bytes collapse to the one honest unreadable outcome', async () => {
  const result = await openPdfDocument(pdfjs, new Uint8Array([1, 2, 3, 4, 5]));
  assert.deepEqual(result, { ok: false, reason: 'unreadable' });
});

test('a PDF truncated mid-file is unreadable, not a hang or a crash', async () => {
  const result = await openPdfDocument(pdfjs, buildTwoPagePdf().slice(0, 120));
  assert.equal(result.ok, false);
});

test('zero bytes — the empty-blob edge — is unreadable, honestly', async () => {
  const result = await openPdfDocument(pdfjs, new Uint8Array(0));
  assert.deepEqual(result, { ok: false, reason: 'unreadable' });
});

// ---- Sizing and memory arithmetic ---------------------------------------------

test('fit-to-width fills the column and never upscales past 2×', () => {
  assert.equal(fitToWidthScale(595, 595), 1);
  assert.ok(Math.abs(fitToWidthScale(595, 360) - 360 / 595) < 1e-9, 'phones scale down to fit');
  assert.equal(fitToWidthScale(100, 1000), 2, 'a tiny page is not blown into blur');
  assert.equal(fitToWidthScale(0, 360), 1, 'degenerate input degrades to 1, never NaN');
});

test('zoom is clamped to the supported range and never NaN', () => {
  assert.equal(clampZoom(0.2), MIN_ZOOM);
  assert.equal(clampZoom(2), 2);
  assert.equal(clampZoom(99), MAX_ZOOM);
  assert.equal(clampZoom(Number.NaN), MIN_ZOOM);
});

test('every render obeys the per-page canvas pixel budget, whatever is asked', () => {
  // Fit-width A4 on a phone stays comfortably under budget…
  const modest = renderGeometry({
    pageWidth: 595, pageHeight: 842, cssScale: 360 / 595, devicePixelRatio: 2,
  });
  assert.ok(modest.canvasWidth * modest.canvasHeight <= PAGE_PIXEL_BUDGET);
  assert.ok(modest.canvasWidth >= 719 && modest.canvasWidth <= 721,
    'and renders at full device sharpness (no needless downscale)');
  // …while max zoom on a 3× display is capped instead of allocating ~48 MP.
  const extreme = renderGeometry({
    pageWidth: 595, pageHeight: 842, cssScale: 3, devicePixelRatio: 3,
  });
  assert.ok(extreme.canvasWidth * extreme.canvasHeight <= PAGE_PIXEL_BUDGET,
    'a 20 MB wallet PDF at max pinch must not freeze a phone');
  assert.ok(extreme.renderScale < 3 * 3, 'the scale was actually reduced');
});

test('devicePixelRatio is capped: 3× displays pay 2× memory, not 9×', () => {
  const at2 = renderGeometry({ pageWidth: 200, pageHeight: 200, cssScale: 1, devicePixelRatio: 2 });
  const at3 = renderGeometry({ pageWidth: 200, pageHeight: 200, cssScale: 1, devicePixelRatio: 3 });
  assert.equal(at2.canvasWidth, at3.canvasWidth);
});

test('the lazy window keeps visible pages plus one neighbour each side — nothing more', () => {
  assert.deepEqual([...renderWindow([3], 10, 1)].sort((a, b) => a - b), [2, 3, 4]);
  assert.deepEqual([...renderWindow([1], 10, 1)].sort((a, b) => a - b), [1, 2], 'clamped at the front');
  assert.deepEqual([...renderWindow([10], 10, 1)].sort((a, b) => a - b), [9, 10], 'clamped at the back');
  assert.deepEqual([...renderWindow([4, 5], 60, 1)].sort((a, b) => a - b), [3, 4, 5, 6],
    'a 60-page PDF holds a handful of canvases, never sixty');
  assert.deepEqual([...renderWindow([], 10, 1)].sort((a, b) => a - b), [1, 2],
    'before any visibility is measured, the document opens rendering from page 1');
  assert.deepEqual([...renderWindow([1], 0, 1)], [], 'an empty document renders nothing');
});

// ---- Architecture guards (source contracts) ------------------------------------

const engine = read('src/pdf/pdfEngine.ts');
const source = read('src/pdf/pdfDocumentSource.mjs');
const viewer = read('src/components/WalletPdfViewer.tsx');
const viteConfig = read('vite.config.ts');
const pkg = JSON.parse(read('package.json'));

test('the renderer is the npm package, version-locked, worker bundled locally', () => {
  assert.equal(pkg.dependencies['pdfjs-dist'], '6.2.108',
    'exact pin: the API chunk and the worker must never drift apart');
  assert.match(engine, /import\('pdfjs-dist\/legacy\/build\/pdf\.mjs'\)/,
    'the LEGACY build — the Android WebView population lags current Chrome');
  assert.match(engine, /import\('pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs\?url'\)/,
    'the worker ships as a Vite asset from the same package');
  assert.match(engine, /GlobalWorkerOptions\.workerSrc = worker\.default/);
});

test('no CDN, no runtime network: document bytes never leave the device', () => {
  for (const [name, text] of [
    ['src/pdf/pdfEngine.ts', engine],
    ['src/pdf/pdfDocumentSource.mjs', source],
    ['src/components/WalletPdfViewer.tsx', viewer],
  ]) {
    const code = codeOf(text);
    assert.ok(!/https?:\/\//.test(code), `${name} must not reference an external URL`);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(code),
      `${name} must not reach the network itself`);
  }
  assert.match(engine, /import\.meta\.env\.BASE_URL/,
    'auxiliary assets resolve same-origin under the app base');
  assert.match(codeOf(source), /isEvalSupported: false/,
    'embedded-JS/eval paths stay off for locally stored documents');
});

test('the pdf engine is a LAZY chunk — non-PDF users never download it', () => {
  assert.match(viewer, /await import\('\.\.\/pdf\/pdfEngine'\)/,
    'the viewer pulls the engine on first open');
  for (const file of [
    'src/components/TripView.tsx',
    'src/components/MembershipQuickAccess.tsx',
    'src/wallet/documentDelivery.mjs',
    'src/wallet/documentOpening.ts',
  ]) {
    const code = codeOf(read(file));
    assert.ok(!/from 'pdfjs-dist|from "\.\.\/pdf\/pdfEngine|import '\.\.\/pdf\/pdfEngine/.test(code),
      `${file} must not import the renderer statically`);
  }
  // Static pdfjs imports live in exactly one runtime module: the engine.
  assert.ok(!/from 'pdfjs-dist/.test(codeOf(viewer)),
    'the viewer component itself stays engine-agnostic (types aside)');
});

test('both builds ship the auxiliary decode assets and precache them for offline', () => {
  assert.match(viteConfig, /pdfjsAuxAssets\(\)/, 'the copy plugin runs for web AND native');
  assert.match(viteConfig, /pdfjs\/\$\{family\}\/\$\{name\}/, 'emitted under a stable pdfjs/ path');
  for (const family of ['wasm', 'iccs', 'standard_fonts']) {
    assert.match(viteConfig, new RegExp(family), `the ${family} family is shipped`);
  }
  assert.match(viteConfig, /\*\*\/\*\.\{js,mjs,css,html,svg,png,ico,woff2,webp,wasm,pfb,ttf,icc\}/,
    'the PWA precache covers the worker (.mjs) and every decode-asset type — offline-first holds');
  assert.match(engine, /wasmUrl|standardFontDataUrl|iccUrl/, 'and the engine points pdf.js at them');
});

test('the viewer keeps the app-shell contract: title, close, honest error, no hand-off', () => {
  assert.match(viewer, /<dialog/, 'same native modal contract as every other overlay');
  assert.match(viewer, /\{doc\.title\}/, 'the document title is the heading');
  assert.match(viewer, /aria-label="Close document"/);
  assert.match(viewer, /interceptAndroidBack/,
    'Android hardware Back closes the full-screen surface instead of navigating under it');
  assert.match(viewer, /could not be displayed/, 'a corrupt PDF gets an honest error…');
  assert.match(viewer, /saveGeneratedFile/, '…and the EXISTING save path, not an external viewer');
  assert.match(viewer, /role="alert"/, 'the error is announced');
  assert.match(viewer, /role="status"/, 'so is loading');
  assert.ok(!/URL\.createObjectURL/.test(codeOf(viewer)),
    'bytes reach pdf.js directly — no object-URL detour to leak');
});

test('pages render lazily into bounded canvases and release when far away', () => {
  assert.match(viewer, /IntersectionObserver/, 'visibility drives rendering');
  assert.match(viewer, /renderWindow\(/, 'the shared window arithmetic decides what stays live');
  assert.match(viewer, /renderGeometry\(/, 'the shared budget arithmetic sizes every canvas');
  assert.match(viewer, /canvas\.width = 0/, 'released pages give their pixels back');
  assert.match(viewer, /cleanup\(\)/, 'pdf.js page resources are released too');
  assert.match(viewer, /renderTask\?\.cancel\(\)/, 'superseded renders are cancelled, not awaited');
});
