/**
 * THE FJÄLLKOMPIS BRANDING CONTRACT — one identity, two distribution channels.
 *
 * Fjallkompis ships as a PWA (GitHub Pages) and as an Android app (Google
 * Play). They are ONE product, so they must not carry two separately
 * maintained sets of icons. This file is the machine-readable statement of
 * that: it names the single master artwork, the brand colours, and every
 * derived icon each platform consumes — with the geometry each derivation
 * uses.
 *
 * TO CHANGE THE FJÄLLKOMPIS IDENTITY, replace `master` below and run
 *
 *     npm run generate:brand
 *
 * Every PWA and Android icon is rewritten from it. `npm test` then re-derives
 * each one and compares pixels, so a hand-edited or accidentally-reverted icon
 * fails CI instead of shipping. There is deliberately no second master: the
 * splash mark, the launcher icon, the favicon and the Play listing icon are
 * all this one file, scaled and plated differently for contracts that differ
 * per platform.
 *
 * PROVENANCE AND ITS ONE LIMITATION. `fjallkompis-mark-512.png` is the
 * approved Fjallkompis mark — a compass star behind a mountain roundel — and
 * it is a 512x512 RASTER. The repository contains no vector (SVG/AI) master
 * and none was reconstructed for this contract: redrawing or AI-recreating the
 * mark would be a redesign wearing the old logo's clothes. 512x512 is
 * therefore the ceiling for every derived size, which is sufficient for every
 * contract listed here (the largest consumer, the Play Store listing icon, is
 * exactly 512x512). If a genuine vector master is ever produced, it belongs
 * here, and the derived sizes should be regenerated from it.
 */

/**
 * Brand colours. These are NOT invented for icons — each is an existing app
 * token, quoted so the launcher, the splash and the installed PWA cannot
 * drift apart. tests/native-runtime.test.mjs separately pins the native
 * colours against the CSS/manifest values.
 */
export const BRAND_COLORS = {
  /**
   * The icon plate: the surface the mark sits on wherever an icon may not be
   * transparent (Android launcher, iOS home screen, Play listing). Not a new
   * colour — it is the plate already baked into the app's maskable PWA icon.
   */
  plate: '#e9edeb',
  /**
   * The launch surface: the PWA manifest's `background_color`, Capacitor's
   * `android.backgroundColor`, and `windowSplashScreenBackground`. Equals the
   * CSS token `stone-bg`.
   */
  launch: '#dce4d8',
  /** Brand chrome behind the status bar: `theme_color` / CSS token `spruce`. */
  spruce: '#2f4a3d',
};

/**
 * THE PRODUCT NAME, and the line between a NAME and an IDENTITY.
 *
 * `Fjallkompis` — no diaeresis — is the canonical v1 product spelling. It is
 * what the user reads: the launcher label, the browser tab, the installed-PWA
 * name, the Play listing, in-app copy.
 *
 * It is NOT a technical identifier, and normalising it must never be allowed
 * to become one. Everything below keeps its existing value, because each is a
 * compatibility contract where a change means data loss, a second app, or a
 * dead URL — not a cosmetic difference:
 *
 *   repository / Pages base+scope   Fjallkompis            (already unaccented)
 *   Android application id          com.algolon.fjallkompis
 *   backup envelope                 app: 'fjallkompis'
 *   localStorage / IndexedDB keys   fjallkompis-*
 *   Cache Storage names             fjallkompis-offline-*
 *   Android resource names          fjallkompis_mark, fjallkompis_splash
 *
 * Those all use the lowercase unaccented form already, so the rename touches
 * none of them by construction — the only string that changes is the accented
 * display spelling. tests/branding-parity.test.mjs asserts both halves: that
 * every display surface says `Fjallkompis`, and that the identities above are
 * untouched.
 */
export const PRODUCT_NAME = 'Fjallkompis';

/** The full display title: manifest `name` and the document title. */
export const PRODUCT_TITLE = `${PRODUCT_NAME} — Kungsleden hiking companion`;

/** The one master everything below is derived from, repo-relative. */
export const MASTER = 'assets/brand/fjallkompis-mark-512.png';

/**
 * Copies that must be BYTE-IDENTICAL to the master rather than resampled from
 * it. Android's build system cannot read a PNG from outside `res/`, and Vite
 * only publishes what is under `public/`, so the same bytes have to exist in
 * three places. Byte-identity is asserted by test, which is what stops those
 * three places from becoming three subtly different logos.
 */
export const MASTER_COPIES = [
  {
    path: 'public/icons/icon-512.png',
    why: 'the 512 PWA manifest icon (purpose "any"), served from public/',
  },
  {
    path: 'android/app/src/main/res/drawable-nodpi/fjallkompis_mark.png',
    why: 'the Android adaptive-icon foreground AND the launch splash mark; res/ cannot reference files outside itself',
  },
];

/**
 * Default tolerance for "is this still the Fjallkompis mark?", as a mean
 * absolute per-channel difference (0-255) against a freshly derived reference.
 *
 * WHY A TOLERANCE AND NOT BYTE EQUALITY. The PWA icons are the original
 * approved renderings, produced by a different resampler than
 * scripts/lib/png.mjs, so they will never be byte-identical to a regeneration.
 * Measured headroom, at the values in this file: every genuine asset scores
 * <= 6.8, while the nearest WRONG answer — the same mark plated in white
 * instead of #e9edeb — scores 12.7, a solid plate with no mark at all scores
 * 23.6, and a transparent-backed mark where a plated one belongs scores 170.
 * 10 sits in that gap: loose enough to survive a resampler difference, tight
 * enough that no plausible drift (wrong colour, wrong scale, wrong artwork,
 * a returning Capacitor default) can pass.
 */
export const DEFAULT_TOLERANCE = 10;

/**
 * Assets derived from the master by resampling.
 *
 * `markSpan` is the fraction of the icon's width that the MARK ITSELF spans —
 * the thing a human can check against a launcher, rather than an opaque scale
 * factor. The master's own mark spans 0.94 of its canvas, so `markSpan: 0.94`
 * means "unchanged framing", 0.80 means "inset for a mask", and 1.00 means
 * "bled to the edge".
 *
 * `plate: null` keeps transparency; a colour flattens onto that plate.
 */
export const DERIVED = [
  // --- PWA -------------------------------------------------------------------
  {
    path: 'public/icons/icon-192.png',
    size: 192,
    markSpan: 0.94,
    plate: null,
    channel: 'pwa',
    why: 'PWA manifest icon, purpose "any". Same framing as the master; transparency is correct here because "any" icons are composited by the browser, not masked.',
  },
  {
    path: 'public/icons/icon-maskable-512.png',
    size: 512,
    markSpan: 0.8,
    plate: BRAND_COLORS.plate,
    opaque: true,
    channel: 'pwa',
    why: 'PWA manifest icon, purpose "maskable". The maskable spec reserves the outer 10% on every side for the platform\'s mask, so the mark spans 80% and the plate must reach every corner — a transparent maskable icon renders as a black square on some launchers.',
  },
  {
    path: 'public/icons/apple-touch-icon.png',
    size: 180,
    markSpan: 0.9,
    plate: BRAND_COLORS.plate,
    opaque: true,
    channel: 'pwa',
    why: 'iOS home screen. iOS composites a touch icon onto BLACK rather than honouring alpha, so this one must be plated. Its mask is a gentle squircle, not Android\'s aggressive circle, so the mark is framed at 90% rather than 80%.',
  },
  {
    path: 'public/icons/favicon.png',
    size: 64,
    markSpan: 1.0,
    plate: null,
    channel: 'pwa',
    why: 'Browser tab. Nothing masks a favicon and it is read at 16px, so the mark is bled to the canvas edge for maximum legibility rather than inset.',
  },

  // --- Android legacy launcher icons (API 24-25) -----------------------------
  //
  // From API 26 the adaptive icon in mipmap-anydpi-v26 wins and these are
  // never drawn. They exist because minSdk is 24. They are plated because a
  // legacy launcher icon is drawn AS SUPPLIED, with no mask and no background.
  ...[
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ].flatMap(([density, size]) => [
    {
      path: `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
      size,
      markSpan: 0.8,
      plate: BRAND_COLORS.plate,
      opaque: true,
      channel: 'android',
      why: `Legacy square launcher icon at ${density}. Framed at 80% to match the adaptive icon's safe zone, so API 25 and API 26+ present the mark at the same size.`,
    },
    {
      path: `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`,
      size,
      markSpan: 0.8,
      plate: BRAND_COLORS.plate,
      round: true,
      channel: 'android',
      why: `Legacy ROUND launcher icon at ${density} (android:roundIcon). Round-icon launchers on API 24-25 draw this resource without applying a mask of their own, so it must arrive already circular — a square here renders as a square amongst circles.`,
    },
  ]),

  // --- Play Store listing ----------------------------------------------------
  {
    path: 'assets/brand/play-store-icon-512.png',
    size: 512,
    markSpan: 0.8,
    plate: BRAND_COLORS.plate,
    opaque: true,
    channel: 'play',
    published: false,
    why: 'Google Play Console listing icon. NOT interchangeable with the adaptive launcher resource even though it shares the identity: Play requires exactly 512x512, a full-bleed square with NO transparency, and applies its own rounding — so this is a flat opaque PNG, not an adaptive foreground. It is not shipped inside the app; it is uploaded by hand in Play Console.',
  },
];

/** Every asset this contract governs, derived or copied. */
export function allBrandAssets() {
  return [...MASTER_COPIES.map((c) => ({ ...c, copyOfMaster: true })), ...DERIVED];
}
