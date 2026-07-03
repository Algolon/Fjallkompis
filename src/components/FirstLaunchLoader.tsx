import { useEffect, useState, type CSSProperties } from 'react';

/**
 * First-launch loading screen: a calm walking-hiker vignette shown once per
 * browser session, on top of the app while it settles. Purely presentational
 * — the app renders underneath from the first frame, so dismissing the
 * loader causes no layout shift and moves no focus.
 *
 * All timing knobs live in LOADER_TIMING below. The walk cycle and fade
 * durations are forwarded to CSS as custom properties, so the numbers here
 * are the single source of truth.
 */
export const LOADER_TIMING = {
  /** Overlay fade-in. Keep short — it must never feel like added wait. */
  fadeInMs: 200,
  /**
   * Decorative minimum time the loader stays fully visible (after fade-in).
   * Long enough for at least one recognisable walk cycle, well under the
   * 3 s presentation ceiling.
   */
  minVisibleMs: 1800,
  /** Overlay fade-out into the app. */
  fadeOutMs: 320,
  /** One full walk cycle (both steps). Calm at 1.2–1.4 s. */
  walkCycleMs: 1300,
};

const SESSION_KEY = 'fjallkompis.introShown';

/**
 * Once-per-session gate, checked with a lazy useState initializer in App.
 * sessionStorage (not localStorage) on purpose: the intro naturally returns
 * when the app/tab is fully closed and reopened, never on internal
 * navigation or reloads within the same session. Marks the session as seen
 * immediately so an interrupted intro doesn't replay on reload.
 */
export function shouldShowFirstLaunchLoader(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    sessionStorage.setItem(SESSION_KEY, '1');
    return true;
  } catch {
    // Blocked storage (private mode): skip the intro rather than risk
    // replaying it on every reload.
    return false;
  }
}

type Phase = 'enter' | 'visible' | 'leaving' | 'done';

/**
 * `ready` gates dismissal on real app readiness. This app boots
 * synchronously (state loads from localStorage, all data is bundled), so
 * App passes nothing and the default `true` applies: the loader shows for
 * exactly the decorative minimum. If async boot work ever appears, pass
 * `ready={false}` until it completes — the walk cycle keeps looping and the
 * loader leaves as soon as both the minimum has elapsed and `ready` is true.
 */
export function FirstLaunchLoader({ ready = true }: { ready?: boolean }) {
  const [phase, setPhase] = useState<Phase>('enter');
  const [minElapsed, setMinElapsed] = useState(false);

  // Mount at opacity 0, then flip to visible on the next frame so the CSS
  // fade-in transition actually runs (double rAF avoids paint batching).
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase('visible'));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(
      () => setMinElapsed(true),
      LOADER_TIMING.fadeInMs + LOADER_TIMING.minVisibleMs,
    );
    return () => clearTimeout(t);
  }, []);

  // Leave only when BOTH the decorative minimum and readiness are met.
  useEffect(() => {
    if (phase === 'visible' && minElapsed && ready) setPhase('leaving');
  }, [phase, minElapsed, ready]);

  // Unmount after the fade-out. Separate effect: if this timer lived in the
  // transition-triggering effect above, that effect's cleanup would cancel
  // it the moment `phase` flipped to 'leaving'. setTimeout instead of
  // transitionend because prefers-reduced-motion disables transitions
  // globally, which would swallow the event and strand the overlay.
  useEffect(() => {
    if (phase !== 'leaving') return;
    const t = setTimeout(() => setPhase('done'), LOADER_TIMING.fadeOutMs);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      className={`launch-loader${phase === 'visible' ? ' is-visible' : ''}${
        phase === 'leaving' ? ' is-leaving' : ''
      }`}
      role="status"
      aria-label="Fjällkompis is preparing your journey"
      style={
        {
          '--walk-cycle': `${LOADER_TIMING.walkCycleMs}ms`,
          '--loader-fade-in': `${LOADER_TIMING.fadeInMs}ms`,
          '--loader-fade-out': `${LOADER_TIMING.fadeOutMs}ms`,
        } as CSSProperties
      }
    >
      <HikerWalking />
      <p className="launch-loader__text" aria-hidden>
        Preparing your journey
      </p>
    </div>
  );
}

/**
 * Stylised side-profile hiker, drawn as an inline SVG silhouette in the
 * app's spruce token (via currentColor) and animated with pure CSS.
 *
 * Limbs are round-capped strokes grouped so each swings around its joint
 * (hips at 62,78; shoulders at ~65,47 in viewBox units — the CSS
 * transform-origins in global.css must match these). The static geometry is
 * a natural mid-stride pose, so when prefers-reduced-motion freezes the
 * animations the figure still reads as a hiker, not a mannequin.
 */
function HikerWalking() {
  return (
    <svg
      className="hiker"
      viewBox="0 0 128 132"
      aria-hidden
      focusable="false"
    >
      <ellipse className="hiker-shadow" cx="64" cy="126" rx="26" ry="3" />
      <g className="hiker-bob">
        {/* Back arm — painted first so it sits behind the torso */}
        <g className="hiker-arm hiker-arm--back">
          <polyline points="64,47 57,59 62,70" />
        </g>
        {/* Back leg (drawn trailing) */}
        <g className="hiker-leg hiker-leg--back">
          <polyline points="62,78 58,95 51,109" />
          <line x1="50" y1="111.5" x2="60" y2="112.5" />
        </g>
        {/* Backpack + bedroll */}
        <g className="hiker-pack">
          <rect x="44" y="30" width="22" height="9.5" rx="4.75" />
          <rect x="43" y="40" width="16" height="30" rx="7" transform="rotate(-6 51 55)" />
        </g>
        {/* Torso (thick round-capped stroke = capsule) */}
        <line className="hiker-torso" x1="65" y1="44" x2="62" y2="78" />
        {/* Head + cap with forward brim */}
        <circle cx="69" cy="25" r="8" />
        <path d="M60.2 23 A 8.8 8.8 0 0 1 77.8 23 Z" />
        <rect x="75" y="20.2" width="9" height="3.4" rx="1.7" />
        {/* Front leg (drawn leading) */}
        <g className="hiker-leg hiker-leg--front">
          <polyline points="62,78 69,95 68,112" />
          <line x1="68" y1="114" x2="78" y2="113" />
        </g>
        {/* Front arm + trekking pole (pole swings with the arm) */}
        <g className="hiker-arm hiker-arm--front">
          <polyline points="66,47 73,57 82,62" />
          <line className="hiker-pole" x1="85" y1="53" x2="78" y2="121" />
        </g>
      </g>
    </svg>
  );
}
