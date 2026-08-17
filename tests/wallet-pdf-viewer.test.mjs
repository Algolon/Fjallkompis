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
  BASE_PAGE_GAP,
  MAX_ZOOM,
  MIN_ZOOM,
  PAGE_PIXEL_BUDGET,
  clampZoom,
  fitDocumentHeight,
  fitToWidthScale,
  pageGap,
  pinchState,
  renderGeometry,
  renderWindow,
  zoomCommitScroll,
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

// ---- Pinch-zoom gesture arithmetic ----------------------------------------------
// The zoom contract as pure math: the content point under the fingers'
// midpoint stays anchored while the pinch is live AND across the commit,
// when the layout re-flows and the scroller is repositioned. These tests
// drive whole gestures as numbers — the DOM only executes this arithmetic.

test('a live pinch anchors the content point under the starting midpoint', () => {
  const live = pinchState({
    zoom: 1,
    startDistance: 100,
    currentDistance: 180,
    startMid: { x: 220, y: 340 },
    currentMid: { x: 220, y: 340 },
  });
  assert.equal(live.pendingZoom, 1.8);
  assert.equal(live.scale, 1.8, 'live scale is pending/committed');
  assert.equal(live.originX, 220, 'transform-origin IS the focal content point…');
  assert.equal(live.originY, 340, '…so scaling cannot move it');
  assert.equal(live.translateX, 0);
  assert.equal(live.translateY, 0, 'a stationary midpoint adds no drift');
});

test('midpoint drift during the pinch becomes translation — fingers stay glued', () => {
  const live = pinchState({
    zoom: 1.5,
    startDistance: 120,
    currentDistance: 120,
    startMid: { x: 200, y: 300 },
    currentMid: { x: 160, y: 260 },
  });
  assert.equal(live.pendingZoom, 1.5, 'no distance change → no zoom change');
  assert.equal(live.scale, 1);
  assert.equal(live.translateX, -40);
  assert.equal(live.translateY, -40, 'two-finger pan rides along as pure translate');
});

test('the live pinch clamps at the zoom limits instead of overshooting', () => {
  const over = pinchState({
    zoom: 2.5, startDistance: 100, currentDistance: 300,
    startMid: { x: 0, y: 0 }, currentMid: { x: 0, y: 0 },
  });
  assert.equal(over.pendingZoom, MAX_ZOOM);
  assert.ok(Math.abs(over.scale - MAX_ZOOM / 2.5) < 1e-12,
    'once clamped, the visual scale stops growing too — no rubber-band lie');
  const under = pinchState({
    zoom: 1.2, startDistance: 200, currentDistance: 50,
    startMid: { x: 0, y: 0 }, currentMid: { x: 0, y: 0 },
  });
  assert.equal(under.pendingZoom, MIN_ZOOM, 'fit-to-width is the floor');
  const broken = pinchState({
    zoom: 1, startDistance: 0, currentDistance: 100,
    startMid: { x: 0, y: 0 }, currentMid: { x: 0, y: 0 },
  });
  assert.ok(Number.isFinite(broken.pendingZoom), 'degenerate input never yields NaN');
});

test('the commit places the scaled focal point exactly under the fingers — no snap', () => {
  // Pinch from zoom 1 to 2 about a point mid-document, fingers drifting a
  // little: after commit, clientPos(focal × ratio) must equal the fingers'
  // final midpoint. That equality IS the "no visible jump" guarantee.
  const zoom = 1;
  const live = pinchState({
    zoom,
    startDistance: 100,
    currentDistance: 200,
    startMid: { x: 180, y: 900 },   // column coords (already scrolled down)
    currentMid: { x: 168, y: 880 }, // slight drift while pinching
  });
  const columnOffset = { left: 12, top: 14 };
  const focalViewport = { x: 150, y: 420 }; // final midpoint in the scroller viewport
  const commit = zoomCommitScroll({
    zoom,
    pendingZoom: live.pendingZoom,
    focalContent: { x: live.originX, y: live.originY },
    focalViewport,
    columnOffset,
  });
  const ratio = live.pendingZoom / zoom;
  // Re-derive the on-screen position of the scaled focal point.
  const screenX = columnOffset.left + live.originX * ratio - commit.scrollLeft;
  const screenY = columnOffset.top + live.originY * ratio - commit.scrollTop;
  assert.equal(screenX, focalViewport.x, 'horizontal anchor preserved across the re-layout');
  assert.equal(screenY, focalViewport.y, 'vertical anchor preserved across the re-layout');
});

test('a no-op pinch (ratio 1) commits the drift as scroll — pan, not snap-back', () => {
  const commit = zoomCommitScroll({
    zoom: 2,
    pendingZoom: 2,
    focalContent: { x: 400, y: 600 },
    focalViewport: { x: 230, y: 350 },
    columnOffset: { left: 12, top: 14 },
  });
  assert.equal(commit.scrollLeft, 12 + 400 - 230);
  assert.equal(commit.scrollTop, 14 + 600 - 350);
});

test('commit scroll is bounded below — the document can never be lost off-screen', () => {
  const commit = zoomCommitScroll({
    zoom: 2,
    pendingZoom: 1,
    focalContent: { x: 30, y: 40 },
    focalViewport: { x: 300, y: 500 },
    columnOffset: { left: 12, top: 14 },
  });
  assert.equal(commit.scrollLeft, 0);
  assert.equal(commit.scrollTop, 0,
    'negative targets clamp to the origin; the scroller clamps its own maximum');
});

test('the page gap scales with zoom, keeping the uniform-scaling model exact', () => {
  assert.equal(pageGap(1), BASE_PAGE_GAP);
  assert.equal(pageGap(2), BASE_PAGE_GAP * 2);
  assert.equal(pageGap(99), BASE_PAGE_GAP * MAX_ZOOM, 'gap input is clamped like zoom');
});

test('fitDocumentHeight wraps a one-page document exactly — no trailing spacer', () => {
  // A4 fit to a 364px column: round(842 × 364/595) = 515, plus 28px padding.
  assert.equal(fitDocumentHeight([{ w: 595, h: 842 }], 364, 28), 515 + 28);
  // The same rounding and 2× upscale cap as the page slots themselves.
  assert.equal(
    fitDocumentHeight([{ w: 100, h: 50 }], 1000, 28),
    Math.round(50 * 2) + 28,
    'a tiny page contributes its capped 2× height, exactly like its slot renders',
  );
});

test('fitDocumentHeight stacks multi-page documents with base gaps', () => {
  const a4 = { w: 595, h: 842 };
  const one = fitDocumentHeight([a4], 364, 28);
  const three = fitDocumentHeight([a4, a4, a4], 364, 28);
  assert.equal(three, one + 2 * (515 + BASE_PAGE_GAP),
    'each extra page adds its fit height plus ONE base gap — nothing more');
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

test('the viewer is a modal LIGHTBOX layered over the originating screen', () => {
  const css = read('src/styles/global.css');
  const block = css.slice(css.indexOf('/* CONTENT-FIT SIZING'), css.indexOf('.pdf-viewer__save-note'));
  assert.match(block, /\.pdf-viewer::backdrop\s*{[^}]*rgba\(/,
    'the backdrop DIMS the originating screen — it is visible behind, never covered');
  assert.ok(!/::backdrop\s*{[^}]*transparent/.test(block),
    'the old full-bleed transparent backdrop must not come back');
  assert.match(block, /border-radius: var\(--r-lg\)/, 'rounded Fjallkompis surface');
  assert.match(block, /calc\(100vw - 24px\)/,
    'phones keep the near-full-WIDTH treatment — the page is never shrunk to expose backdrop');
  assert.match(block, /inset: calc\(var\(--safe-top\)[^;]*calc\(var\(--safe-bottom\)/,
    'the modal sits inside the safe areas via its inset');
  assert.match(block, /@media \(min-width: 760px\)/,
    'wider viewports get a clearly centred modal with more backdrop');
  assert.ok(!/100vw;\s*\n\s*height: 100vh/.test(block), 'no full-bleed sizing remains');
});

test('the modal is CONTENT-FIT: it wraps short documents and caps tall ones', () => {
  const css = read('src/styles/global.css');
  const block = css.slice(css.indexOf('/* CONTENT-FIT SIZING'), css.indexOf('.pdf-viewer__save-note'));
  assert.match(block, /height: fit-content/,
    'the dialog is sized by its content — a one-page ticket wraps, no fixed viewport height');
  assert.ok(!/^\s*height: calc\(100dvh/m.test(block),
    'the old fixed viewport height (the giant blank area under short PDFs) must not return');
  assert.match(block, /max-height: calc\(100dvh - var\(--safe-top\) - var\(--safe-bottom\) - 32px\)/,
    'tall documents cap at the viewport and scroll inside');
  assert.match(block, /margin: auto/,
    'the shrink-wrapped modal is vertically centred in the safe area');
  assert.match(block, /flex: 0 1 auto/,
    'the document viewport SHRINKS inside the cap but never grows past its content');
  assert.match(block, /min-height: 0/,
    'without min-height 0 a flex child cannot shrink below its content — the cap would not bite');
  // The component pins the scroller to the fit-layout document height, so
  // the modal wraps the document and a zoom commit cannot resize it.
  assert.match(viewer, /fitDocumentHeight\(/,
    'the scroller height is the shared fit-layout arithmetic');
  assert.match(viewer, /style=\{\{ height: documentHeight \}\}/,
    'and it is applied as an explicit height, independent of the current zoom');
  const docHeightBlock = viewer.slice(
    viewer.indexOf('const documentHeight'),
    viewer.indexOf('return fitDocumentHeight'),
  );
  assert.ok(!/\bzoom\b/.test(docHeightBlock),
    'the modal frame is computed from the FIT layout only — never from the zoom state');
});

test('backdrop tap closes — with a guard so a pinch can never close it', () => {
  assert.match(viewer, /event\.target === dialogRef\.current/,
    'only a click that reached the dialog element itself (the ::backdrop) closes');
  assert.match(viewer, /lastPinchEndRef/,
    'the tail of a pinch near the modal edge is not a backdrop tap');
  assert.match(viewer, /onCancel=/, 'Escape still closes');
  assert.match(viewer, /interceptAndroidBack/, 'Android hardware Back still closes');
});

test('pinch zoom runs on explicit transform state, committed without a snap', () => {
  assert.match(viewer, /pinchState\(/, 'the live gesture is the shared arithmetic…');
  assert.match(viewer, /zoomCommitScroll\(/, '…and so is the commit scroll position');
  assert.match(viewer, /useLayoutEffect/,
    'the transform clears and the scroller repositions BEFORE paint — same frame as the new layout');
  assert.match(viewer, /transformOrigin = `\$\{live\.originX\}px \$\{live\.originY\}px`/,
    'the transform origin is the focal content point, so it stays anchored while scaling');
  assert.match(viewer, /pageGap\(zoom\)/, 'the page gap scales with zoom (uniform-scaling model)');
  assert.match(viewer, /addEventListener\('touchmove', onTouchMove, \{ passive: false \}\)/,
    'two-finger moves are consumed non-passively so native panning never fights the pinch');
  assert.match(viewer, /touches\.length >= 2\) event\.preventDefault\(\)/);
});

test('re-renders draw offscreen and swap in one frame — no blank flash, no visible step', () => {
  assert.match(viewer, /document\.createElement\('canvas'\)/,
    'the sharp render happens on an offscreen canvas');
  assert.match(viewer, /drawImage\(offscreen, 0, 0\)/,
    'the visible bitmap is replaced in one synchronous draw');
  const renderIdx = viewer.indexOf("document.createElement('canvas')");
  const swapIdx = viewer.indexOf('drawImage(offscreen');
  assert.ok(renderIdx >= 0 && renderIdx < swapIdx);
});

test('pages render lazily into bounded canvases and release when far away', () => {
  assert.match(viewer, /IntersectionObserver/, 'visibility drives rendering');
  assert.match(viewer, /renderWindow\(/, 'the shared window arithmetic decides what stays live');
  assert.match(viewer, /renderGeometry\(/, 'the shared budget arithmetic sizes every canvas');
  assert.match(viewer, /canvas\.width = 0/, 'released pages give their pixels back');
  assert.match(viewer, /cleanup\(\)/, 'pdf.js page resources are released too');
  assert.match(viewer, /renderTask\?\.cancel\(\)/, 'superseded renders are cancelled, not awaited');
});
