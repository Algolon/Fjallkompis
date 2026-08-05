/** Camera padding rectangle in CSS pixels (MapLibre's PaddingOptions shape). */
export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export declare const BASE_MAP_PADDING: MapPadding;
export declare const MAX_PADDING_FRACTION: number;
/** Half the widest rendered marker label, rounded up (see mapPadding.mjs). */
export declare const MARKER_LABEL_SAFE_X: number;

export declare function cameraPaddingFor(options: {
  viewportWidth: number;
  viewportHeight: number;
  /** Covered depth from the top edge (the cockpit's lead column). */
  topInset?: number;
  /** Covered depth from the right edge (the map control stack). */
  rightInset?: number;
  /** Covered depth from the bottom edge (the status dock). */
  bottomInset?: number;
  /** Covered depth from the left edge (unused today; kept symmetric). */
  leftInset?: number;
  base?: MapPadding;
}): MapPadding;

/**
 * Padding for the FULL-ROUTE OVERVIEW fit: horizontally balanced and
 * label-safe. Takes no rightInset — the control stack is not charged as a
 * full-height column here.
 */
export declare function overviewPaddingFor(options: {
  viewportWidth: number;
  viewportHeight: number;
  /** Covered depth from the top edge (the cockpit's lead column). */
  topInset?: number;
  /** Covered depth from the bottom edge (the live-tracking pill). */
  bottomInset?: number;
  base?: MapPadding;
  /** Horizontal marker-label allowance; defaults to MARKER_LABEL_SAFE_X. */
  labelSafeX?: number;
}): MapPadding;

export declare function visibleMapRect(options: {
  viewportWidth: number;
  viewportHeight: number;
  padding: MapPadding;
}): { x: number; y: number; width: number; height: number };
