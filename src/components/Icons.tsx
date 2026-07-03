// Lightweight inline stroke icons (no icon library dependency).
// 24x24 viewBox, currentColor stroke.

type P = { className?: string };

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconToday = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  </svg>
);

export const IconMap = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);

export const IconStages = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="m3 17 5-9 4 6 3-4 6 7" />
    <circle cx="8" cy="8" r="1.4" />
  </svg>
);

export const IconHuts = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9h12v-9" />
    <path d="M10 19v-4h4v4" />
  </svg>
);

export const IconChecklist = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="m4 7 2 2 3-3" />
    <path d="m4 16 2 2 3-3" />
    <path d="M12 7h8M12 17h8" />
  </svg>
);

export const IconJournal = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" />
    <path d="M5 4v16M9 8h6M9 12h6" />
  </svg>
);

export const IconSettings = (p: P) => (
  // Cogwheel — deliberately distinct from IconToday's sun.
  <svg {...base} className={p.className} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} width={16} height={16} className={p.className} aria-hidden>
    <path d="m4 12 5 5L20 6" />
  </svg>
);

export const IconLocate = (p: P) => (
  <svg {...base} width={18} height={18} className={p.className} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="8" />
    <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
  </svg>
);

export const IconWifi = (p: P) => (
  <svg {...base} width={16} height={16} className={p.className} aria-hidden>
    <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19" r="0.6" fill="currentColor" />
  </svg>
);

export const IconWifiOff = (p: P) => (
  <svg {...base} width={16} height={16} className={p.className} aria-hidden>
    <path d="M2 8.5a15 15 0 0 1 6-3.8M22 8.5a15 15 0 0 0-3-2.2M8.5 15.5a5 5 0 0 1 6-0.6" />
    <path d="m2 2 20 20" />
    <circle cx="12" cy="19" r="0.6" fill="currentColor" />
  </svg>
);
