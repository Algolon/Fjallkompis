/** Narrowest map CONTAINER width (CSS px) that may carry the zoom control. */
export declare const ZOOM_CONTROL_MIN_MAP_WIDTH: number;

/**
 * Whether MapLibre's bottom-right zoom control belongs on the map: fine
 * pointer AND a container wide enough that the buttons do not cover the
 * route's eastern end. See mapZoomControl.mjs for the measured sweep.
 */
export declare function shouldShowZoomControl(options: {
  /** Map CONTAINER width in CSS px (not the window width). */
  mapWidth: number;
  /** Result of '(hover: hover) and (pointer: fine)'. */
  finePointer: boolean;
}): boolean;
