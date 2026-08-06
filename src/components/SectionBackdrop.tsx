import { type CSSProperties } from 'react';

/**
 * Decorative topographic backdrop for the two content sections — a real
 * contour crop near the trail, extracted from the app's own contour archive
 * (see public/images/guide|plan/README.md for provenance), base-coloured by
 * the section theme in CSS (glacier for Guide, copper for Plan).
 *
 * Rendered at the APP-SHELL level, outside the per-destination <main>
 * remount, so the layer survives home ↔ subroute navigation inside its
 * section: one stable position:fixed element that never remounts, never
 * re-requests its asset and never resizes while child routes fade. Switching
 * Guide ↔ Plan reuses the same DOM node (class + custom-property swap only).
 */
const CONTOUR_SRC = {
  guide: `${import.meta.env.BASE_URL}images/guide/contours.svg`,
  plan: `${import.meta.env.BASE_URL}images/plan/contours.svg`,
} as const;

export type SectionThemeId = keyof typeof CONTOUR_SRC;

export function SectionBackdrop({ section }: { section: SectionThemeId }) {
  return (
    <div
      className={`screen-bg screen-bg--${section}`}
      aria-hidden
      style={
        { '--screen-bg-image': `url("${CONTOUR_SRC[section]}")` } as CSSProperties
      }
    />
  );
}
