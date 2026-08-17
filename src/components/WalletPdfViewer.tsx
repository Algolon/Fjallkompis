import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import type { WalletDocument } from '../types';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import { interceptAndroidBack } from '../runtime/platform';
import { saveGeneratedFile } from '../runtime/fileSave';
import { walletDownloadFileName } from '../wallet/walletModel.mjs';
import {
  clampZoom,
  fitToWidthScale,
  pageGap,
  pinchState,
  renderGeometry,
  renderWindow,
  zoomCommitScroll,
} from '../pdf/pdfViewerCore.mjs';
import type { PinchStateResult } from '../pdf/pdfViewerCore.mjs';
import type { OpenPdfResult } from '../pdf/pdfEngine';

/**
 * The in-app PDF viewer — Fjallkompis' own document surface, shared verbatim
 * by every platform and every entry point (Wallet list, Travel & stays
 * attachments, Today quick access). A stored PDF opens HERE, inside the app
 * shell: never a browser tab, never a hand-off to an external viewer app.
 *
 * PRESENTATION: a modal LIGHTBOX, not a screen. The originating surface
 * stays visible behind a dimmed backdrop; the document sits above it on a
 * rounded Fjallkompis surface — nearly full-screen on phones (a small
 * visible margin keeps the "layered over" reading), a centred modal with
 * generous backdrop on wider viewports. Opening a document must feel like
 * "I'm looking at this from the page I was on", never like navigating to a
 * new section. Native <dialog> carries the modal contract: focus trap,
 * Escape → close, backdrop click → close (with a guard so the tail of a
 * pinch can never close it), Android hardware Back → close
 * (interceptAndroidBack), background inert and scroll-locked, focus back to
 * the opener afterwards. No history entries — no navigation traps.
 *
 * RENDERING: pdf.js, loaded LAZILY through src/pdf/pdfEngine.ts on first
 * open. Pages render fit-to-width into bounded canvases and only a small
 * window of pages around the viewport holds live pixels
 * (src/pdf/pdfViewerCore.mjs owns those numbers). Re-renders draw into an
 * OFFSCREEN canvas and swap in one frame — the visible bitmap is never
 * cleared while its replacement is still rasterising.
 *
 * ZOOM: fit-to-width is the floor; pinch up to MAX_ZOOM. The gesture is
 * modelled with explicit state (src/pdf/pdfViewerCore.mjs — pinchState /
 * zoomCommitScroll), not implicit browser layout: while the fingers move,
 * the column wears a cheap CSS transform whose origin is the CONTENT point
 * under the fingers' midpoint, so that point stays anchored; on release the
 * layout commits at the new zoom and the scroller is repositioned in the
 * SAME frame to keep that point exactly where the fingers left it — the
 * sharp pdf.js re-render then replaces bitmaps in place, so there is no
 * visible snap in either scale or position. Panning while zoomed is native
 * one-finger scrolling (real physics, naturally bounded); at fit-width the
 * same finger scrolls the document. Two-finger moves are preventDefault-ed
 * so native panning never fights the pinch. Double-tap zoom was evaluated
 * and left out: without an animated transition it reads as a hard cut, and
 * animating it would add a second transform pipeline for a secondary
 * gesture — pinch remains the one zoom input.
 *
 * Failure is honest: bytes that do not open as a PDF show an error state
 * that says so and offers the existing SAVE path — never a silent external
 * hand-off. The blob is owned by the CALLER; no object URLs here.
 */

type PdfPageHandle = {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: { canvas: HTMLCanvasElement; viewport: unknown }): {
    promise: Promise<void>;
    cancel(): void;
  };
  cleanup(): void;
};

type PdfDocHandle = Extract<OpenPdfResult, { ok: true }>;

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; pageCount: number }
  | { kind: 'unreadable' };

/** Everything a live pinch needs, captured once at gesture start. */
interface PinchTracking {
  pointers: Map<number, { x: number; y: number }>;
  startDistance: number;
  startMidClient: { x: number; y: number };
  /** Frozen at start: the column's client origin (transform target frame). */
  columnOrigin: { x: number; y: number };
  /** Frozen at start: the scroller's padding-box client origin. */
  scrollerOrigin: { x: number; y: number };
  /** Column offset from the scroller's content origin (padding + centring). */
  columnOffset: { left: number; top: number };
  zoomAtStart: number;
  live: PinchStateResult | null;
  lastMidClient: { x: number; y: number };
}

/** A zoom commit staged for the layout effect that runs before paint. */
interface PendingCommit {
  scrollLeft: number;
  scrollTop: number;
}

export function WalletPdfViewer({
  doc,
  blob,
  onClose,
}: {
  doc: WalletDocument;
  blob: Blob;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PdfDocHandle | null>(null);
  const headingId = useId();
  useOverlayScrollLock();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [columnWidth, setColumnWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [livePages, setLivePages] = useState<Set<number>>(() => new Set([1]));
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // Best-known page size at pdf scale 1 — page 1 measured first, used as the
  // placeholder estimate for pages not yet measured, so unrendered pages
  // occupy honest space and scrolling does not jump.
  const [pageDims, setPageDims] = useState<Map<number, { w: number; h: number }>>(
    () => new Map(),
  );

  // ---- Modal contract ---------------------------------------------------------
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);

  // Android hardware Back puts the document away instead of navigating the
  // shell underneath this overlay. A no-op off Android (the installed PWA's
  // own back handling closes modal dialogs natively).
  useEffect(
    () =>
      interceptAndroidBack(() => {
        onClose();
        return true;
      }),
    [onClose],
  );

  // ---- Open the document (lazy engine) ----------------------------------------
  useEffect(() => {
    let live = true;
    setPhase({ kind: 'loading' });
    setZoom(1);
    setPageDims(new Map());
    setLivePages(new Set([1]));
    (async () => {
      const { openWalletPdf } = await import('../pdf/pdfEngine');
      const result = await openWalletPdf(blob);
      if (!live) {
        if (result.ok) void result.destroy();
        return;
      }
      if (!result.ok) {
        setPhase({ kind: 'unreadable' });
        return;
      }
      handleRef.current = result;
      setPhase({ kind: 'ready', pageCount: result.doc.numPages });
    })().catch((err) => {
      console.warn('Fjallkompis: the PDF viewer failed to start.', err);
      if (live) setPhase({ kind: 'unreadable' });
    });
    return () => {
      live = false;
      const handle = handleRef.current;
      handleRef.current = null;
      if (handle) void handle.destroy();
    };
  }, [blob]);

  // ---- Fit-to-width geometry ----------------------------------------------------
  // The scroller's content width is what pages fit to; rotation and window
  // resizes re-measure it and the pages re-render at the new width. The
  // scroller only exists once the document is READY (loading/error states
  // render no page column), so this effect keys on the phase — an empty
  // dependency list here once left columnWidth at 0 and no page ever drew.
  useEffect(() => {
    if (phase.kind !== 'ready') return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = () => {
      const styles = getComputedStyle(scroller);
      const inner =
        scroller.clientWidth -
        parseFloat(styles.paddingLeft || '0') -
        parseFloat(styles.paddingRight || '0');
      setColumnWidth(Math.max(0, Math.floor(inner)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [phase.kind]);

  // ---- Which pages hold live canvases --------------------------------------------
  const pageCount = phase.kind === 'ready' ? phase.pageCount : 0;
  const visibleRef = useRef<Set<number>>(new Set());
  const applyWindow = useCallback(() => {
    const next = renderWindow(visibleRef.current, pageCount, 1);
    setLivePages((current) => {
      if (current.size === next.size && [...next].every((p) => current.has(p))) {
        return current;
      }
      return next;
    });
  }, [pageCount]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (pageCount === 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (!page) continue;
          if (entry.isIntersecting) visibleRef.current.add(page);
          else visibleRef.current.delete(page);
        }
        applyWindow();
      },
      // One viewport of lead in both directions: the next page is usually
      // rendered before it scrolls in, without keeping distant pages alive.
      { root: scroller, rootMargin: '100% 0px' },
    );
    observerRef.current = observer;
    // Pages mounted before this observer existed (the ready render commits
    // first) are picked up here; later mounts go through observePage.
    for (const node of scroller.querySelectorAll('[data-page]')) {
      observer.observe(node);
    }
    applyWindow();
    return () => {
      observer.disconnect();
      observerRef.current = null;
      visibleRef.current = new Set();
    };
  }, [pageCount, applyWindow]);

  const observePage = useCallback((node: HTMLElement | null) => {
    if (node) observerRef.current?.observe(node);
  }, []);

  const onPageMeasured = useCallback((page: number, w: number, h: number) => {
    setPageDims((current) => {
      const known = current.get(page);
      if (known && known.w === w && known.h === h) return current;
      const next = new Map(current);
      next.set(page, { w, h });
      return next;
    });
  }, []);

  // ---- Pinch zoom -------------------------------------------------------------
  // Explicit transform state (pinchState / zoomCommitScroll), never implicit
  // layout. The commit is staged here and applied in the layout effect below,
  // in the same frame as the new layout — which is what makes it snap-free.
  const pinchRef = useRef<PinchTracking | null>(null);
  const commitRef = useRef<PendingCommit | null>(null);
  const lastPinchEndRef = useRef(0);

  // Native panning must not fight a live pinch: two-finger touchmoves are
  // consumed (the listener is registered non-passively — React's synthetic
  // handlers cannot preventDefault a passive touchmove). One finger keeps
  // native scrolling untouched, physics and bounds included.
  useEffect(() => {
    if (phase.kind !== 'ready') return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2) event.preventDefault();
    };
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => scroller.removeEventListener('touchmove', onTouchMove);
  }, [phase.kind]);

  const applyLiveTransform = (live: PinchStateResult | null) => {
    const column = columnRef.current;
    if (!column) return;
    if (!live || (live.scale === 1 && live.translateX === 0 && live.translateY === 0)) {
      column.style.transform = '';
      column.style.transformOrigin = '';
      return;
    }
    column.style.transformOrigin = `${live.originX}px ${live.originY}px`;
    column.style.transform =
      `translate(${live.translateX}px, ${live.translateY}px) scale(${live.scale})`;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const scroller = scrollerRef.current;
    const column = columnRef.current;
    if (!scroller || !column) return;
    const current = pinchRef.current ?? {
      pointers: new Map(),
      startDistance: 0,
      startMidClient: { x: 0, y: 0 },
      columnOrigin: { x: 0, y: 0 },
      scrollerOrigin: { x: 0, y: 0 },
      columnOffset: { left: 0, top: 0 },
      zoomAtStart: zoom,
      live: null,
      lastMidClient: { x: 0, y: 0 },
    };
    current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (current.pointers.size === 2) {
      const [a, b] = [...current.pointers.values()];
      const columnRect = column.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      current.startDistance = Math.hypot(a.x - b.x, a.y - b.y);
      current.startMidClient = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      current.lastMidClient = current.startMidClient;
      current.columnOrigin = { x: columnRect.left, y: columnRect.top };
      current.scrollerOrigin = {
        x: scrollerRect.left + scroller.clientLeft,
        y: scrollerRect.top + scroller.clientTop,
      };
      current.columnOffset = {
        left: columnRect.left - current.scrollerOrigin.x + scroller.scrollLeft,
        top: columnRect.top - current.scrollerOrigin.y + scroller.scrollTop,
      };
      current.zoomAtStart = zoom;
      current.live = null;
    }
    pinchRef.current = current;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || !pinch.pointers.has(event.pointerId)) return;
    pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.pointers.size !== 2 || pinch.startDistance <= 0) return;
    const [a, b] = [...pinch.pointers.values()];
    pinch.lastMidClient = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch.live = pinchState({
      zoom: pinch.zoomAtStart,
      startDistance: pinch.startDistance,
      currentDistance: Math.hypot(a.x - b.x, a.y - b.y),
      // Column coordinates: the transform-origin frame is the column's own
      // (untransformed) box, frozen at gesture start.
      startMid: {
        x: pinch.startMidClient.x - pinch.columnOrigin.x,
        y: pinch.startMidClient.y - pinch.columnOrigin.y,
      },
      currentMid: {
        x: pinch.lastMidClient.x - pinch.columnOrigin.x,
        y: pinch.lastMidClient.y - pinch.columnOrigin.y,
      },
    });
    applyLiveTransform(pinch.live);
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || !pinch.pointers.delete(event.pointerId)) return;
    if (pinch.pointers.size >= 2) return;
    if (pinch.live) {
      lastPinchEndRef.current = Date.now();
      const live = pinch.live;
      const target = zoomCommitScroll({
        zoom: pinch.zoomAtStart,
        pendingZoom: live.pendingZoom,
        focalContent: { x: live.originX, y: live.originY },
        focalViewport: {
          x: pinch.lastMidClient.x - pinch.scrollerOrigin.x,
          y: pinch.lastMidClient.y - pinch.scrollerOrigin.y,
        },
        columnOffset: pinch.columnOffset,
      });
      commitRef.current = target;
      if (live.pendingZoom !== pinch.zoomAtStart) {
        // The layout effect below clears the transform and repositions the
        // scroller in the SAME pre-paint frame as the new layout.
        setZoom(live.pendingZoom);
      } else {
        // Pure two-finger pan: fold the translate into scroll right now.
        const scroller = scrollerRef.current;
        applyLiveTransform(null);
        if (scroller) {
          scroller.scrollLeft = target.scrollLeft;
          scroller.scrollTop = target.scrollTop;
        }
        commitRef.current = null;
      }
      pinch.live = null;
      pinch.startDistance = 0;
    }
    if (pinch.pointers.size === 0) pinchRef.current = null;
  };

  // The snap-free commit: runs after React applied the new zoom to the DOM
  // (page widths, heights and the scaled gap) and BEFORE the browser paints.
  // Clearing the live transform and setting the derived scroll offsets here
  // means no frame ever shows the old position at the new layout.
  useLayoutEffect(() => {
    const commit = commitRef.current;
    if (!commit) return;
    commitRef.current = null;
    applyLiveTransform(null);
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollLeft = commit.scrollLeft;
      scroller.scrollTop = commit.scrollTop;
    }
  }, [zoom]);

  // ---- Error-state save (the honest fallback — never an external viewer) -------
  const saveCopy = async () => {
    setSaveNote(null);
    try {
      const outcome = await saveGeneratedFile(
        walletDownloadFileName(doc),
        blob,
        doc.mimeType,
      );
      setSaveNote(
        outcome === 'saved'
          ? 'A copy was saved.'
          : 'Saving was cancelled — the document is still stored here.',
      );
    } catch (err) {
      console.warn('Fjallkompis: could not save a copy of the document.', err);
      setSaveNote('A copy could not be saved on this device.');
    }
  };

  const estimate = useMemo(() => {
    // A4 portrait until page 1 is measured — close enough that the scrollbar
    // does not lurch when real sizes arrive.
    return pageDims.get(1) ?? { w: 595, h: 842 };
  }, [pageDims]);

  return (
    <dialog
      ref={dialogRef}
      className="pdf-viewer"
      aria-labelledby={headingId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Backdrop close: a click that TARGETS the dialog element itself hit
        // the ::backdrop (all children fill the surface). The time guard
        // keeps the tail of a pinch near the modal edge from ever closing —
        // backdrop tap is a convenience exit; ×, Escape and Android Back are
        // the primary ones.
        if (
          event.target === dialogRef.current &&
          Date.now() - lastPinchEndRef.current > 400
        ) {
          onClose();
        }
      }}
    >
      <div className="pdf-viewer__chrome">
        <header className="pdf-viewer__head">
          <h2 id={headingId} className="pdf-viewer__title">
            {doc.title}
          </h2>
          <button
            className="ctx-help-close"
            onClick={onClose}
            aria-label="Close document"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </header>

        {phase.kind === 'loading' ? (
          <div className="pdf-viewer__state" role="status">
            <p>Opening document…</p>
          </div>
        ) : null}

        {phase.kind === 'unreadable' ? (
          <div className="pdf-viewer__state" role="alert">
            <p>
              This document could not be displayed — the stored file does not
              open as a PDF on this device. It has not been changed or removed.
            </p>
            <button type="button" className="btn" onClick={() => void saveCopy()}>
              Save a copy
            </button>
            {saveNote ? (
              <p className="pdf-viewer__save-note" role="status">
                {saveNote}
              </p>
            ) : null}
          </div>
        ) : null}

        {phase.kind === 'ready' ? (
          <div
            ref={scrollerRef}
            className="pdf-viewer__scroller"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
          >
            <div
              ref={columnRef}
              className="pdf-viewer__column"
              style={{ gap: pageGap(zoom) }}
            >
              {Array.from({ length: phase.pageCount }, (_, i) => i + 1).map(
                (page) => (
                  <PdfViewerPage
                    key={page}
                    page={page}
                    live={livePages.has(page)}
                    columnWidth={columnWidth}
                    zoom={zoom}
                    dims={pageDims.get(page) ?? estimate}
                    measured={pageDims.has(page)}
                    onMeasured={onPageMeasured}
                    observe={observePage}
                    getHandle={() => handleRef.current}
                  />
                ),
              )}
            </div>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

/**
 * One page slot. The WRAPPER always has the exact layout size for the
 * current zoom (React-driven, so a zoom commit re-lays-out synchronously);
 * the canvas fills it, which stretches the existing bitmap to the new size
 * until the sharp re-render lands. Re-renders draw into an offscreen canvas
 * and swap in one frame — the visible bitmap is never cleared first, so
 * zooming never flashes a blank page. Outside the live window the canvas
 * releases its pixels and pdf.js page resources are cleaned up.
 */
function PdfViewerPage({
  page,
  live,
  columnWidth,
  zoom,
  dims,
  measured,
  onMeasured,
  observe,
  getHandle,
}: {
  page: number;
  live: boolean;
  columnWidth: number;
  zoom: number;
  dims: { w: number; h: number };
  measured: boolean;
  onMeasured: (page: number, w: number, h: number) => void;
  observe: (node: HTMLElement | null) => void;
  getHandle: () => PdfDocHandle | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!live || columnWidth <= 0) return;
    const handle = getHandle();
    if (!handle) return;
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel(): void } | null = null;
    let pageHandle: PdfPageHandle | null = null;
    (async () => {
      const pdfPage = (await handle.doc.getPage(page)) as unknown as PdfPageHandle;
      if (cancelled) return;
      pageHandle = pdfPage;
      const base = pdfPage.getViewport({ scale: 1 });
      onMeasured(page, base.width, base.height);
      const cssScale = fitToWidthScale(base.width, columnWidth) * clampZoom(zoom);
      const geometry = renderGeometry({
        pageWidth: base.width,
        pageHeight: base.height,
        cssScale,
        devicePixelRatio: window.devicePixelRatio || 1,
      });
      // Offscreen first: the canvas on screen keeps showing its current
      // bitmap (CSS-stretched to the new layout) until the replacement is
      // COMPLETE, then the swap is one synchronous draw — no blank interval,
      // no half-rendered page, no visible re-render step.
      const offscreen = document.createElement('canvas');
      offscreen.width = geometry.canvasWidth;
      offscreen.height = geometry.canvasHeight;
      renderTask = pdfPage.render({
        canvas: offscreen,
        viewport: pdfPage.getViewport({ scale: geometry.renderScale }),
      });
      await renderTask.promise;
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = geometry.canvasWidth;
      canvas.height = geometry.canvasHeight;
      canvas.getContext('2d')?.drawImage(offscreen, 0, 0);
      setRendered(true);
    })().catch((err: unknown) => {
      // A cancelled render (scroll moved on, zoom changed) is routine.
      if (!cancelled && (err as { name?: string })?.name !== 'RenderingCancelledException') {
        console.warn(`Fjallkompis: PDF page ${page} failed to render.`, err);
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      pageHandle?.cleanup();
    };
  }, [live, columnWidth, zoom, page, getHandle, onMeasured]);

  // Outside the live window the canvas gives its pixels back; the wrapper
  // keeps the page's size so the scroll position stays honest.
  useEffect(() => {
    if (live) return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    setRendered(false);
  }, [live]);

  const cssScale = fitToWidthScale(dims.w, columnWidth || dims.w) * clampZoom(zoom);
  const width = Math.round(dims.w * cssScale);
  const height = Math.round(dims.h * cssScale);

  return (
    <div
      ref={observe}
      data-page={page}
      className="pdf-viewer__page"
      style={{ width, height }}
      aria-label={`Page ${page}${measured ? '' : ' (loading)'}`}
    >
      <canvas ref={canvasRef} className="pdf-viewer__canvas" aria-hidden />
      {live && !rendered ? <div className="pdf-viewer__page-loading" /> : null}
    </div>
  );
}
