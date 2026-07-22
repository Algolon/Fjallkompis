/**
 * MembershipCardViewer — the CENTRED STF credential quick viewer.
 *
 * The rules under test:
 *  - the Today quick access opens THIS viewer (a centred modal), while the
 *    generic Lists → Trip document viewer keeps its bottom-sheet
 *    presentation untouched;
 *  - the modal contract is native <dialog>: showModal (focus trap +
 *    Escape → close), labelled title, accessible close button, deliberate
 *    backdrop-click close, focus returned to the opener (the roundel);
 *  - the credential is shown whole — object-fit: contain, never cropped —
 *    inside a viewport/safe-area-bounded centred surface;
 *  - it appears from the centre (scale/fade), never slides from the bottom;
 *  - the caller owns and revokes the object URL (documentOpening.ts stays
 *    the one blob authority) — no duplicate open/revoke logic;
 *  - a missing file never reaches the viewer (the quick action is omitted).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viewer = readFileSync(join(root, 'src/components/MembershipCardViewer.tsx'), 'utf8');
const quickAccess = readFileSync(join(root, 'src/components/MembershipQuickAccess.tsx'), 'utf8');
const tripView = readFileSync(join(root, 'src/components/TripView.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

test('quick access opens the centred credential viewer; Trip keeps its sheet', () => {
  assert.match(quickAccess, /<MembershipCardViewer/);
  assert.ok(!quickAccess.includes('TripImageViewer'), 'quick access no longer uses the sheet viewer');
  // The generic Trip document viewer is unchanged.
  assert.match(tripView, /<TripImageViewer/);
  assert.match(tripView, /className="sheet wallet-viewer"/);
});

test('native <dialog> modal contract: trap, title, Escape, backdrop, focus return', () => {
  assert.match(viewer, /dialogRef\.current\?\.showModal\(\)/, 'modal trap + native Escape');
  assert.match(viewer, /aria-labelledby=\{headingId\}/);
  assert.match(viewer, /<h2 id=\{headingId\}>STF membership card<\/h2>/, 'meaningful title');
  assert.match(viewer, /aria-label="Close"/, 'close control has an accessible name');
  assert.match(viewer, /onClose=\{onClose\}/, 'native close (Escape) reaches the caller');
  assert.match(
    viewer,
    /if \(e\.target === dialogRef\.current\) onClose\(\)/,
    'backdrop click closes (dialog itself is only hit outside the body)',
  );
  assert.match(viewer, /return \(\) => opener\?\.focus\(\)/, 'focus returns to the roundel');
  // No nested interactive elements: exactly one button (Close).
  const buttons = viewer.match(/<button/g) ?? [];
  assert.equal(buttons.length, 1);
});

test('the credential is announced once and shown whole', () => {
  // The document title is the image alternative; the heading names the
  // surface — no duplicated announcement from decorative imagery.
  assert.match(viewer, /alt=\{doc\.title\}/);
  const img = css.slice(css.indexOf('.credential-viewer__img {'), css.indexOf('/* --- Packing list'));
  assert.match(img, /max-width: 100%/);
  assert.match(img, /max-height: min\(62vh, 62dvh\)/);
  assert.match(img, /object-fit: contain/, 'scaled to fit, never cropped');
});

test('the modal is centred, viewport-bounded, and appears from the centre', () => {
  const modal = css.slice(css.indexOf('.credential-viewer {'), css.indexOf('.credential-viewer__body'));
  assert.match(modal, /inset: 0;\n  margin: auto;/, 'centred, not bottom-anchored');
  assert.match(modal, /width: min\(560px, calc\(100vw - 32px\)\)/, 'Today column width + gutters');
  assert.match(modal, /max-height: min\(calc\(100vh - 40px\), calc\(100dvh - 40px\)\)/);
  assert.match(modal, /::backdrop/, 'backdrop dims the full app');
  // Scale/fade entrance — no slide-up.
  assert.match(css, /@keyframes credential-pop \{\n  from \{\n    opacity: 0;\n    transform: scale\(0\.97\);/);
  const pop = css.slice(css.indexOf('@keyframes credential-pop'), css.indexOf('.credential-viewer__body'));
  assert.ok(!pop.includes('translateY'), 'no slide animation');
});

test('the caller owns the blob lifecycle; missing files never open a viewer', () => {
  assert.match(quickAccess, /openWalletDocument\(doc, wallet\.getFile\)/, 'shared opening logic');
  assert.match(quickAccess, /URL\.revokeObjectURL\(viewer\.url\)/, 'object URL revoked on close');
  assert.ok(!viewer.includes('createObjectURL'), 'viewer never mints URLs');
  assert.ok(!viewer.includes('revokeObjectURL'), 'viewer never revokes URLs (caller owns)');
  assert.match(quickAccess, /result\.kind === 'missing'/, 'missing file hides the action');
});
