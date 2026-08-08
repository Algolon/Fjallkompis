#!/usr/bin/env node
/**
 * Verify the BUILT PWA actually serves the public privacy policy.
 *
 *     npm run build && node scripts/verify-privacy-build.mjs
 *
 * WHY A BUILD-OUTPUT CHECK AND NOT ONLY A SOURCE TEST.
 * tests/privacy-policy.test.mjs checks the source tree: that the page exists
 * under public/, that its wording matches the shared constants, that Settings
 * links to the canonical URL. None of that is the claim Google Play depends
 * on, which is "https://algolon.github.io/Fjallkompis/privacy/ resolves to
 * readable policy text". Between the two sit Vite (which copies public/) and
 * vite-plugin-pwa (which decides what Workbox precaches and which navigations
 * the SPA fallback swallows). A build that drops the page, or a service worker
 * that answers that URL with the app shell, passes every source-level test and
 * still gives a Play reviewer the wrong page.
 *
 * So this reads dist/ and nothing else.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  PRIVACY_CONTACT_URL,
  PRIVACY_POLICY_URL,
} from '../src/privacy/privacyPolicy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);

if (!existsSync(DIST)) {
  console.error('dist/ does not exist — run `npm run build` first.');
  process.exit(1);
}

const isNative = existsSync(join(DIST, '.native-build'));
notes.push(`build target: ${isNative ? 'native (Capacitor WebView)' : 'web/PWA (GitHub Pages)'}`);

// ---------------------------------------------------------------------------
// 1. The page is in the build, on BOTH targets.
//
// The native APK does not serve the canonical URL — Settings links out to the
// public page — but the file is shared, unbundled public/ content, so it lands
// in either output. Asserting it on both is what keeps the two targets from
// diverging into "the web build has a policy page and the APK build does not".
// ---------------------------------------------------------------------------
const pagePath = join(DIST, 'privacy', 'index.html');
if (!existsSync(pagePath)) {
  fail('dist/privacy/index.html is missing — the public privacy policy did not make it into the build');
}
const page = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';

// ---------------------------------------------------------------------------
// 2. It is the policy, not an empty shell or the app.
// ---------------------------------------------------------------------------
if (page) {
  if (!/<title>[^<]*Privacy policy[^<]*<\/title>/i.test(page)) {
    fail('dist/privacy/index.html has no "Privacy policy" title');
  }
  if (!page.includes(`<link rel="canonical" href="${PRIVACY_POLICY_URL}"`)) {
    fail(`dist/privacy/index.html does not declare ${PRIVACY_POLICY_URL} as its canonical URL`);
  }
  if (!page.includes(PRIVACY_CONTACT_URL)) {
    fail('dist/privacy/index.html carries no privacy contact route');
  }
  // The MECHANISM, not just the string: Play expects a mailbox for the privacy
  // contact, so a build whose Contact section had decayed into a link-only
  // route would satisfy the check above and still fail review.
  if (!/^mailto:/.test(PRIVACY_CONTACT_URL)) {
    fail(`the privacy contact is not a mailbox: ${PRIVACY_CONTACT_URL}`);
  }
  // A page that needs the bundle is a page that can fail to render exactly
  // when the app is broken — the one moment the policy still has to be legible.
  if (/<script/i.test(page)) {
    fail('dist/privacy/index.html contains a <script> — the policy page must render without JavaScript');
  }
  // Every resource it references must be same-origin. A remote font or stylesheet
  // would make the privacy page itself contact a third party.
  const remote = [...page.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)]
    .map((m) => m[0])
    .filter((attr) => !attr.startsWith('href="https://algolon.github.io/'))
    // Policy prose legitimately LINKS to GitHub and Google; those are anchors
    // the reader may follow, not resources the page loads. Anything else is.
    .filter((attr) => !/href="https:\/\/(github\.com|docs\.github\.com|policies\.google\.com)\//.test(attr));
  if (remote.length > 0) {
    fail(`dist/privacy/index.html loads off-origin resources: ${remote.join(', ')}`);
  }
  notes.push(`policy page: dist/privacy/index.html (${page.length} bytes, no JavaScript)`);
}

// ---------------------------------------------------------------------------
// 3. The service worker must not shadow it (web target only).
// ---------------------------------------------------------------------------
if (!isNative) {
  const swName = readdirSync(DIST).find((f) => f === 'sw.js');
  if (!swName) {
    fail('no sw.js in dist/ — expected a service worker in the web build');
  } else {
    const sw = readFileSync(join(DIST, swName), 'utf8');
    // Precached: the policy stays readable offline, like the rest of the shell.
    if (!sw.includes('privacy/index.html')) {
      fail('privacy/index.html is not in the service worker precache list');
    }
    // Denied the SPA fallback: a navigation to /privacy/ must never be answered
    // with the app shell. See navigateFallbackDenylist in vite.config.ts.
    if (!/denylist/i.test(sw) || !sw.includes('privacy')) {
      fail(
        'the service worker does not exclude /privacy/ from the navigation fallback — ' +
          'the app shell could be served in place of the policy page',
      );
    }
    notes.push('service worker: privacy page precached and excluded from the SPA navigation fallback');
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.error('\nPrivacy build verification FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`  ✓ public privacy policy verified in the build (${PRIVACY_POLICY_URL})`);
