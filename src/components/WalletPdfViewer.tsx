import {
  useCallback,
  useEffect,
  useId,
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
  renderGeometry,
  renderWindow,
} from '../pdf/pdfViewerCore.mjs';
import type { OpenPdfResult } from '../pdf/pdfEngine';

/**
 * The in-app PDF viewer — Fjallkompis' own document surface, shared verbatim
 * by every platform and every entry point (Wallet list, Travel & stays
 * attachments, Today quick access). A stored PDF opens HERE, inside the app
 * shell: never a browser tab, never a hand-off to an external viewer app.
 *
 * Presentation: a full-screen native <dialog> (same modal contract as every
 * other overlay — showModal focus trap, Escape → close, focus returns to the
 * opener) wearing the app's own surfaces: a paper header with the document
 * title and a close control, pages stacked on a quiet deeper backdrop.
 * Deliberately NO toolbar — scrolling and pinching are the interface, like
 * the image viewers.
 *
 * Rendering: pdf.js, loaded LAZILY through src/pdf/pdfEngine.ts the first
 * time a PDF is actually opened. Pages render fit-to-width into bounded
 * canvases and only a small window of pages around the viewport holds live
 * pixels (src/pdf/pdfViewerCore.mjs owns those numbers) — a several-MB,
 * many-page Wallet PDF must scroll without freezing a phone.
 *
 * Zoom: a self-tracked two-pointer pinch (1×–3×), because the app's viewport
 * meta disables browser page zoom everywhere. During the gesture the page
 * column scales visually (cheap CSS transform); on release the committed
 * zoom re-renders the visible pages at the sharper scale. Horizontal panning
 * while zoomed is native scrolling. This is deliberately the smallest
 * reliable zoom: no double-tap heuristics, no zoom buttons.
 *
 * Android hardware Back closes the viewer (interceptAndroidBack) instead of
 * navigating the shell underneath it — for a full-screen surface, Back must
 * mean "put the document away".
 *
 * Failure is honest: bytes that do not open as a PDF show an error state
 * that says so and offers the existing SAVE path (the same SAF/download
 * boundary as "Download a copy") — never a silent external hand-off. The
 * blob is owned by the CALLER; this component never creates object URLs.
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

/** Pinch state lives outside React — pointer events arrive too fast for state. */
interface PinchTracking {
  pointers: Map<number, { x: number; y: number }>;
  startDistance: number;
  startZoom: number;
  pending: number;
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

  // ---- Modal contract (same as every other overlay) -------------------------
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);

  // Android hardware Back puts the document away instead of navigating the
  // shell underneath this full-screen surface. A no-op off Android (the
  // installed PWA's own back handling closes modal dialogs natively).
  useEffect(
    () =>
      interceptAndroidBack(() => {
        onClose();
        return true;
      }),
    [onClose],
  );

  // ---- Open the document (lazy engine) ---------------------------------------
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

  // ---- Fit-to-width geometry --------------------------------------------------
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

  // ---- Which pages hold live canvases ------------------------------------------
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

  // ---- Pinch zoom ---------------------------------------------------------------
  const pinchRef = useRef<PinchTracking | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const current = pinchRef.current ?? {
      pointers: new Map(),
      startDistance: 0,
      startZoom: zoom,
      pending: zoom,
    };
    current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (current.pointers.size === 2) {
      current.startDistance = pointerDistance(current.pointers);
      current.startZoom = zoom;
      current.pending = zoom;
    }
    pinchRef.current = current;
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || !pinch.pointers.has(event.pointerId)) return;
    pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.pointers.size !== 2 || pinch.startDistance <= 0) return;
    pinch.pending = clampZoom(
      pinch.startZoom * (pointerDistance(pinch.pointers) / pinch.startDistance),
    );
    // Cheap live feedback: scale the whole column visually; the sharp
    // re-render happens once, on release.
    const column = columnRef.current;
    if (column) {
      column.style.transformOrigin = 'top center';
      column.style.transform =
        pinch.pending === pinch.startZoom
          ? ''
          : `scale(${pinch.pending / pinch.startZoom})`;
    }
  };
  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || !pinch.pointers.delete(event.pointerId)) return;
    if (pinch.pointers.size < 2) {
      const column = columnRef.current;
      if (column) column.style.transform = '';
      if (pinch.startDistance > 0 && pinch.pending !== pinch.startZoom) {
        setZoom(pinch.pending);
      }
      pinch.startDistance = 0;
      if (pinch.pointers.size === 0) pinchRef.current = null;
    }
  };

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
            <div ref={columnRef} className="pdf-viewer__column">
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

function pointerDistance(pointers: Map<number, { x: number; y: number }>) {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * One page slot. While inside the live window it holds a rendered canvas at
 * the bounded scale pdfViewerCore computes; outside it, the canvas is
 * released to a fixed-size placeholder (the browser reclaims the pixels) and
 * pdf.js page resources are cleaned up.
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
      const cssScale = fitToWidthScale(base.width, columnWidth) * zoom;
      const geometry = renderGeometry({
        pageWidth: base.width,
        pageHeight: base.height,
        cssScale,
        devicePixelRatio: window.devicePixelRatio || 1,
      });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = geometry.canvasWidth;
      canvas.height = geometry.canvasHeight;
      canvas.style.width = `${Math.round(base.width * cssScale)}px`;
      canvas.style.height = `${Math.round(base.height * cssScale)}px`;
      renderTask = pdfPage.render({
        canvas,
        viewport: pdfPage.getViewport({ scale: geometry.renderScale }),
      });
      await renderTask.promise;
      if (!cancelled) setRendered(true);
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
      canvas.style.width = '';
      canvas.style.height = '';
    }
    setRendered(false);
  }, [live]);

  const cssScale = fitToWidthScale(dims.w, columnWidth || dims.w) * zoom;
  const width = Math.round(dims.w * cssScale);
  const height = Math.round(dims.h * cssScale);

  return (
    <div
      ref={observe}
      data-page={page}
      className="pdf-viewer__page"
      style={{ width, minHeight: height }}
      aria-label={`Page ${page}${measured ? '' : ' (loading)'}`}
    >
      <canvas ref={canvasRef} className="pdf-viewer__canvas" aria-hidden />
      {live && !rendered ? <div className="pdf-viewer__page-loading" /> : null}
    </div>
  );
}
