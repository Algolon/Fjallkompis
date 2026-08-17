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
