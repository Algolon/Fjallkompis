/**
 * Full-screen photographic backgrounds for the Today screen (prototype).
 *
 * The photos live in public/images/today/ and are local, offline-cacheable
 * WebP files (portrait 1200×1800 crops, < 250 KB each) — no runtime image
 * requests leave the app. They are purely decorative: the layer that renders
 * them is aria-hidden, so `alt` here documents the picture for maintainers
 * and licensing rather than for assistive tech.
 */

export interface TodayBackground {
  /** Public URL of the image, already prefixed with the deploy base path. */
  src: string;
  /** Description of the photo for maintainers/attribution (layer is decorative). */
  alt: string;
  /** CSS background-position for the cover crop, e.g. 'center 30%'. */
  objectPosition: string;
  credit?: string;
  license?: string;
}

const base = import.meta.env.BASE_URL;

export const TODAY_BACKGROUNDS: TodayBackground[] = [
  {
    src: `${base}images/today/today-01.webp`,
    alt: 'Aerial view of a braided river delta and lakes below fjäll slopes in autumn colours',
    objectPosition: 'center 40%',
    credit: 'Trip photo — Fjällkompis project',
    license: 'Project-internal use',
  },
  {
    src: `${base}images/today/today-02.webp`,
    alt: 'Snow-dusted mountain above a tundra stream in early autumn',
    objectPosition: 'center 30%',
    credit: 'Trip photo — Fjällkompis project',
    license: 'Project-internal use',
  },
  {
    src: `${base}images/today/today-03.webp`,
    alt: 'Hikers on a stony trail through a wide fjäll valley under heavy clouds',
    objectPosition: 'center 35%',
    credit: 'Trip photo — Fjällkompis project',
    license: 'Project-internal use',
  },
];

/**
 * sessionStorage key remembering the index shown on the previous Today mount,
 * so re-opening Today picks a different photo. Session-scoped on purpose:
 * a fresh app launch may start with any image. This is cosmetic UI state, so
 * it deliberately lives here and not in the persisted AppStore.
 */
const LAST_INDEX_KEY = 'fjallkompis.todayBackground.lastIndex';

/**
 * Pick a background for one Today mount. Stable for the lifetime of the
 * mount when used in a lazy useState initializer; avoids immediately
 * repeating the previous image when two or more images are configured.
 */
export function pickTodayBackground(): TodayBackground | null {
  if (TODAY_BACKGROUNDS.length === 0) return null;

  let last = -1;
  try {
    const raw = sessionStorage.getItem(LAST_INDEX_KEY);
    if (raw != null) last = Number.parseInt(raw, 10);
  } catch {
    // Private mode / blocked storage: random pick without repeat-avoidance.
  }

  const candidates = TODAY_BACKGROUNDS.map((_, i) => i).filter(
    (i) => TODAY_BACKGROUNDS.length < 2 || i !== last,
  );
  const index = candidates[Math.floor(Math.random() * candidates.length)];

  try {
    sessionStorage.setItem(LAST_INDEX_KEY, String(index));
  } catch {
    // Ignore: worst case the next mount may repeat this image.
  }

  return TODAY_BACKGROUNDS[index];
}
