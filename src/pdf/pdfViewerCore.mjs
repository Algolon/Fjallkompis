/**
 * Pure sizing/paging logic for the in-app PDF viewer — everything about
 * showing a Wallet PDF that is arithmetic rather than DOM. Kept as plain
 * .mjs (sibling .d.mts declaration) so `node --test` exercises the exact
 * numbers the viewer uses; src/components/WalletPdfViewer.tsx owns the DOM
 * and pdfjs plumbing and contains no sizing decisions of its own.
 *
 * The memory story lives here, because Wallet PDFs may be up to 20 MB
 * (MAX_WALLET_FILE_BYTES) and a phone must never be frozen by one:
 *
 *  - every page canvas is bounded by PAGE_PIXEL_BUDGET, whatever the zoom or
 *    devicePixelRatio asks for — a canvas is RGBA in memory, so 4 MP ≈ 16 MB,
 *    a defensible worst case per LIVE page;
 *  - only pages inside a small window around the visible ones stay rendered
 *    (renderWindow); everything else is released back to a placeholder, so
 *    a 60-page PDF holds a handful of canvases, not sixty.
 */

/** Zoom limits: 1 is fit-to-width; 3 is comfortably legible small print. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/**
 * Upper bound on the BACKING pixels of one page canvas (width × height in
 * device pixels). 4 MP ≈ a 1638×2318 A4 render — crisper than a 1080p screen
 * can show at fit-width, and still sharp when zoomed into a region.
 */
export const PAGE_PIXEL_BUDGET = 4_000_000;

/** devicePixelRatio beyond 2 buys memory use, not visible sharpness here. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * CSS scale that makes a page fill the available column width. The page is
 * never scaled up past double its natural PDF size (a tiny page blown up to
 * a phone width already looks soft; beyond 2× it is pure blur).
 */
export function fitToWidthScale(pageWidth, containerWidth) {
  if (!(pageWidth > 0) || !(containerWidth > 0)) return 1;
  return Math.min(containerWidth / pageWidth, 2);
}

/** Clamp a requested zoom factor to the supported range. Never NaN. */
export function clampZoom(zoom) {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The scale to hand pdfjs for the actual canvas render: the CSS scale times
 * the (capped) devicePixelRatio, then reduced if the resulting canvas would
 * exceed the per-page pixel budget. Returns { renderScale, canvasWidth,
 * canvasHeight } with integer canvas dimensions, all ≥ 1.
 */
export function renderGeometry({ pageWidth, pageHeight, cssScale, devicePixelRatio }) {
  const dpr = Math.min(
    Math.max(typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1, 1),
    MAX_DEVICE_PIXEL_RATIO,
  );
  const css = typeof cssScale === 'number' && cssScale > 0 ? cssScale : 1;
  let scale = css * dpr;
  const w = Math.max(pageWidth, 1);
  const h = Math.max(pageHeight, 1);
  const pixels = w * scale * (h * scale);
  if (pixels > PAGE_PIXEL_BUDGET) {
    scale *= Math.sqrt(PAGE_PIXEL_BUDGET / pixels);
  }
  return {
    renderScale: scale,
    canvasWidth: Math.max(1, Math.floor(w * scale)),
    canvasHeight: Math.max(1, Math.floor(h * scale)),
  };
}

/**
 * Which pages should HOLD a rendered canvas right now: every visible page
 * plus `margin` pages on each side, clamped to the document. Pages are
 * 1-based, matching pdfjs. An empty visible set (nothing measured yet)
 * keeps the first window alive so the viewer never flashes blank.
 */
export function renderWindow(visiblePages, pageCount, margin = 1) {
  const count = Math.max(0, Math.floor(pageCount) || 0);
  if (count === 0) return new Set();
  const visible = [...visiblePages].filter((p) => p >= 1 && p <= count);
  if (visible.length === 0) {
    return new Set(range(1, Math.min(count, 1 + margin)));
  }
  const first = Math.max(1, Math.min(...visible) - margin);
  const last = Math.min(count, Math.max(...visible) + margin);
  return new Set(range(first, last));
}

function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}
