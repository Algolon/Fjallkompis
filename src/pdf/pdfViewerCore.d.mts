export declare const MIN_ZOOM: number;
export declare const MAX_ZOOM: number;
export declare const PAGE_PIXEL_BUDGET: number;
export declare const MAX_DEVICE_PIXEL_RATIO: number;

export declare function fitToWidthScale(pageWidth: number, containerWidth: number): number;
export declare function clampZoom(zoom: number): number;
export declare function renderGeometry(input: {
  pageWidth: number;
  pageHeight: number;
  cssScale: number;
  devicePixelRatio: number;
}): { renderScale: number; canvasWidth: number; canvasHeight: number };
export declare function renderWindow(
  visiblePages: Iterable<number>,
  pageCount: number,
  margin?: number,
): Set<number>;

export interface PinchStateInput {
  zoom: number;
  startDistance: number;
  currentDistance: number;
  startMid: { x: number; y: number };
  currentMid: { x: number; y: number };
}
export interface PinchStateResult {
  pendingZoom: number;
  scale: number;
  originX: number;
  originY: number;
  translateX: number;
  translateY: number;
}
export declare function pinchState(g: PinchStateInput): PinchStateResult;

export declare function zoomCommitScroll(c: {
  zoom: number;
  pendingZoom: number;
  focalContent: { x: number; y: number };
  focalViewport: { x: number; y: number };
  columnOffset: { left: number; top: number };
}): { scrollLeft: number; scrollTop: number };

export declare const BASE_PAGE_GAP: number;
export declare function pageGap(zoom: number): number;

export declare function fitDocumentHeight(
  pages: Array<{ w: number; h: number }>,
  columnWidth: number,
  verticalPadding: number,
): number;
