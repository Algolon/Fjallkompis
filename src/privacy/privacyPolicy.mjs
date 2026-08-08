/**
 * THE CANONICAL PRIVACY-POLICY LOCATION — one URL, both distribution channels.
 *
 * Fjallkompis ships as a PWA on GitHub Pages and as an Android app on Google
 * Play. Google Play requires a single PUBLIC privacy-policy URL, and the
 * in-app "Privacy policy" entry must point at exactly that page on BOTH
 * targets. So there is one constant here and every surface reads it:
 *
 *   Settings → Privacy            src/screens/SettingsScreen.tsx
 *   Play Console listing          docs/operations/play-data-safety-evidence.md
 *   the page itself               public/privacy/index.html (<link rel=canonical>)
 *
 * WHY ONE FLAT LITERAL AND NOT origin + base + path.
 *
 * scripts/verify-native-build.mjs refuses to sync a bundle in which the Pages
 * project subpath is used as a ROOT-ABSOLUTE asset path — in the WebView it
 * resolves against https://localhost/ and every such asset 404s. Its delimiter
 * class deliberately exempts the subpath when it appears INSIDE an absolute
 * URL (the app already cites github.com/Algolon/Fjallkompis/… as a source),
 * which is exactly the shape below. Composing this value from a separate base
 * constant would reintroduce the dangerous root-absolute form into the shared
 * bundle and fail that gate for no gain — so the derivation lives in
 * tests/privacy-policy.test.mjs, which re-derives this URL from
 * vite.config.ts's `base` and the page's location under public/ and asserts
 * they agree. The fence is kept; only the risky string is not shipped.
 *
 * ABSOLUTE, NOT RELATIVE, ON PURPOSE. The Android WebView serves the app from
 * https://localhost/ — a relative '/privacy/' link there would resolve to a
 * page that does not exist inside the APK. The public page is the canonical
 * one for both targets, so both link out to it.
 *
 * Plain .mjs (sibling .d.mts) so `node --test` reads the same module the app
 * imports, rather than a re-typed copy of the string.
 */

/** The public privacy policy. The value Play Console is given, verbatim. */
export const PRIVACY_POLICY_URL = 'https://algolon.github.io/Fjallkompis/privacy/';

/**
 * The privacy contact route.
 *
 * The public issue tracker of the app's own repository — a real, working,
 * already-public channel that belongs to the project rather than to a person.
 * No personal address is invented here, and none is committed to this
 * repository.
 *
 * OPEN QUESTION FOR THE OWNER, recorded rather than guessed: Google Play's
 * Data safety form asks separately for a privacy contact and, in practice,
 * reviewers expect an EMAIL address for it. If Play requires one, that
 * address is a human decision (which mailbox, published where) — it is not
 * something this codebase may choose. See
 * docs/operations/play-data-safety-evidence.md → "Needs human confirmation".
 */
export const PRIVACY_CONTACT_URL = 'https://github.com/Algolon/Fjallkompis/issues';

/** Human label for the contact route, shared by the page and Settings. */
export const PRIVACY_CONTACT_LABEL = 'the Fjallkompis issue tracker on GitHub';

/**
 * The date the policy text last changed, ISO-8601.
 *
 * Changed ONLY when the wording changes, never as a build stamp: a policy
 * whose "last updated" moves on every deploy tells the reader nothing. The
 * page prints this value and tests/privacy-policy.test.mjs asserts the page
 * and this constant agree, so the two cannot drift.
 */
export const PRIVACY_POLICY_UPDATED = '2026-08-08';
