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

/* ---- Pinch-zoom gesture arithmetic -----------------------------------------
 *
 * The viewer's zoom contract: the CONTENT POINT under the fingers' midpoint
 * stays visually anchored — while the pinch is live (a cheap CSS transform)
 * AND across the commit, when the layout re-flows at the new zoom and the
 * scroller is repositioned in the same frame. Both halves read from the same
 * numbers, so they cannot disagree:
 *
 *   live:    transform-origin at the focal CONTENT point, scale by
 *            pending/committed zoom, translate by the midpoint's own drift
 *            (two fingers panning while pinching);
 *   commit:  the focal content point scales with the layout (×ratio); the
 *            scroll offset that puts it back under the fingers' final
 *            midpoint is derived, not discovered.
 *
 * Everything here is column-relative: `focalContent` is measured against the
 * page column's untransformed box (the element the transform applies to),
 * and the commit result is an absolute scroller offset. Pure functions —
 * `node --test` drives the whole gesture as arithmetic.
 */

/**
 * Live state for an in-progress pinch.
 *
 * @param {object} g
 * @param {number} g.zoom - the committed zoom when the pinch started.
 * @param {number} g.startDistance - finger distance at pinch start (px > 0).
 * @param {number} g.currentDistance - finger distance now.
 * @param {{x: number, y: number}} g.startMid - midpoint at start, in COLUMN
 *   coordinates (client point minus the column's client rect origin).
 * @param {{x: number, y: number}} g.currentMid - midpoint now, in the same
 *   frame of reference as startMid was CAPTURED (client-relative drift is
 *   what matters, so both are simply client coordinates in practice).
 * @returns {{ pendingZoom: number, scale: number,
 *             originX: number, originY: number,
 *             translateX: number, translateY: number }}
 *   scale/origin/translate describe the live CSS transform:
 *   translate(tx,ty) scale(s) with transform-origin at (originX, originY).
 */
export function pinchState(g) {
  const safeStart = g.startDistance > 0 ? g.startDistance : 1;
  const pendingZoom = clampZoom(g.zoom * (g.currentDistance / safeStart));
  return {
    pendingZoom,
    scale: pendingZoom / g.zoom,
    originX: g.startMid.x,
    originY: g.startMid.y,
    translateX: g.currentMid.x - g.startMid.x,
    translateY: g.currentMid.y - g.startMid.y,
  };
}

/**
 * The scroller offsets that keep the focal point anchored across the commit.
 *
 * At commit the live transform is cleared and the column re-lays-out at
 * `pendingZoom` — every content coordinate scales by `ratio`. The one scroll
 * position that makes this invisible places the SCALED focal content point
 * exactly where the live transform last showed it.
 *
 * @param {object} c
 * @param {number} c.zoom - committed zoom before the pinch.
 * @param {number} c.pendingZoom - the zoom being committed.
 * @param {{x: number, y: number}} c.focalContent - the anchored point in
 *   column coordinates of the OLD layout (== pinchState's origin).
 * @param {{x: number, y: number}} c.focalViewport - where that point sits in
 *   the scroller's content-box viewport at release (start midpoint plus the
 *   gesture's translate), relative to the scroller's padding-box origin.
 * @param {{left: number, top: number}} c.columnOffset - the column's offset
 *   from the scroller's content origin (scroller padding; horizontal
 *   centering slack is 0 whenever the column fills the viewport).
 * @returns {{ scrollLeft: number, scrollTop: number }} clamped at 0; the
 *   scroller clamps its own maximum.
 */
export function zoomCommitScroll(c) {
  const ratio = c.pendingZoom / c.zoom;
  return {
    scrollLeft: Math.max(0, c.columnOffset.left + c.focalContent.x * ratio - c.focalViewport.x),
    scrollTop: Math.max(0, c.columnOffset.top + c.focalContent.y * ratio - c.focalViewport.y),
  };
}

/**
 * The vertical gap between pages, SCALED with zoom. The commit arithmetic
 * assumes the whole column scales uniformly by `pendingZoom / zoom`; a fixed
 * pixel gap would break that for every page after the first (the anchored
 * point would land short by pagesAbove × gap × (ratio − 1)). Scaling the gap
 * keeps the model exact — and reads naturally, like zooming one continuous
 * document.
 */
export const BASE_PAGE_GAP = 10;

export function pageGap(zoom) {
  return Math.round(BASE_PAGE_GAP * clampZoom(zoom));
}

/**
 * The document viewport's natural height at FIT-WIDTH — what the modal
 * wraps. The lightbox is content-sized: a one-page ticket gets
 * `header + page + padding` of modal and nothing more, while a document
 * taller than the viewport cap scrolls INSIDE a capped modal. This number
 * is computed from the fit layout (zoom 1) exclusively, and the viewer
 * pins its scroller to it, so committing a zoom or a live pinch transform
 * can never resize the outer modal — the document moves inside a stable
 * frame.
 *
 * Mirrors the page slots' own arithmetic exactly: each page's CSS height
 * is round(pageHeight × fitToWidthScale) — same rounding, same 2× upscale
 * cap — plus the base (unzoomed) gap between pages and the scroller's
 * vertical padding.
 *
 * @param {Array<{w: number, h: number}>} pages - per-page dims at pdf
 *   scale 1, in order (unmeasured pages pass the shared estimate).
 * @param {number} columnWidth - the scroller's content width.
 * @param {number} verticalPadding - the scroller's top+bottom padding.
 * @returns {number} the scroller height that exactly wraps the document.
 */
export function fitDocumentHeight(pages, columnWidth, verticalPadding) {
  let height = verticalPadding;
  for (const page of pages) {
    height += Math.round(page.h * fitToWidthScale(page.w, columnWidth));
  }
  if (pages.length > 1) height += (pages.length - 1) * BASE_PAGE_GAP;
  return height;
}
