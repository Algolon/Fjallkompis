/**
 * Visual header for an expanded stop card — a photograph, or nothing.
 *
 * No stop currently ships one (see data/stops.ts: we hold no redistribution
 * right for third-party imagery), so today this renders nothing at all.
 *
 * It used to fall back to a generated drawing: the whole route's elevation
 * silhouette with a marker at this stop, captioned "N km from Abisko". That
 * stood in for a missing photo, and once the photos were withdrawn it was the
 * only thing left — eight cards each showing the same route profile with the
 * dot in a different place, above a card whose own text already carries the
 * stop's facts. It read as decoration filling a hole rather than as
 * information, so it is gone. The elevation profile still belongs to the
 * surfaces that are actually about the route: the stage hero and the Map.
 *
 * The image branch remains for a genuinely licensed photo added later under
 * public/images/stops/ (see the README there) — shown lazily at a fixed aspect
 * ratio, so adding one causes no layout shift.
 */
import type { TrailStop } from '../types';

export function StopVisual({ stop }: { stop: TrailStop }) {
  if (!stop.image) return null;

  return (
    <figure className="stop-visual">
      <img src={stop.image.src} alt={stop.image.alt} loading="lazy" decoding="async" />
      {stop.image.credit ? (
        <figcaption className="stop-visual-credit">
          {stop.image.credit}
          {stop.image.license ? ` · ${stop.image.license}` : ''}
        </figcaption>
      ) : null}
    </figure>
  );
}
