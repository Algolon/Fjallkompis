/**
 * Install-prompt UX contract (src/components/PwaLifecycle.tsx).
 *
 * The repo has no DOM test runner, so the toast's copy, actions and
 * accessibility are pinned as a source contract (same approach as
 * stage-guides / elevation-placement): a two-line heading + supporting copy,
 * a native "Install now" only when the browser can prompt, an immediate
 * "Later", a 44×44 top-right close button that also dismisses immediately,
 * and a manual-instructions fallback (no "How?" step) elsewhere. The
 * update-available and offline-ready toasts must be left untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/components/PwaLifecycle.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

// ---- Copy --------------------------------------------------------------------

test('the install prompt has a distinct heading and supporting copy', () => {
  // First line is the visual heading (its own element), second is support.
  assert.match(src, /className="pwa-toast__title"[\s\S]*?Install Fjällkompis on this device\?/);
  assert.match(src, /<h2 id="pwa-install-title" className="pwa-toast__title">/);
  assert.match(
    src,
    /className="pwa-toast__sub">\s*For the best experience, install Fjällkompis as an app\./,
  );
  // The heading and support are not fused into one paragraph.
  assert.ok(
    !src.includes('Install Fjällkompis on this device before beta testing offline'),
    'the old single-line install message is gone',
  );
});

test('user-facing install copy never says "PWA"', () => {
  // Guard the visible strings, not the .pwa-toast class names.
  const visible = src.match(/>[^<>{}]*\bPWA\b[^<>{}]*</g) ?? [];
  assert.equal(visible.length, 0, `no visible "PWA" text (found ${JSON.stringify(visible)})`);
});

// ---- Native-prompt browsers --------------------------------------------------

test('native-prompt browsers see exactly Install now + Later — no How?', () => {
  // "How?" is gone entirely (it required two taps to dismiss).
  assert.ok(!src.includes('How?'), 'the How? action is removed');
  assert.ok(!src.includes('installHelpOpen'), 'the installHelpOpen state is removed');
  // Install now is gated on a captured native prompt.
  assert.match(src, /canPrompt && !nativePromptFailed \?[\s\S]*?Install now/);
  // …and it invokes the captured native prompt.
  assert.match(src, /onClick=\{\(\) => void runInstallPrompt\(\)\}/);
  assert.match(src, /const outcome = await promptInstall\(\);/);
});

test('Later dismisses the install prompt immediately', () => {
  // The install toast's "Later" calls the session-dismissal directly, not a
  // second disclosure step.
  assert.match(
    src,
    /className="btn btn-ghost"\s*onClick=\{dismissInstallNudge\}\s*>\s*Later/,
  );
});

// ---- Close button ------------------------------------------------------------

test('the install toast has an accessible 44×44 close button that dismisses', () => {
  assert.match(src, /className="pwa-toast__close"/);
  assert.match(src, /type="button"/);
  assert.match(src, /aria-label="Close installation prompt"/);
  // Real Lucide X icon.
  assert.match(src, /import \{ X \} from 'lucide-react'/);
  assert.match(src, /<X size=\{18\}[\s\S]*?aria-hidden \/>/);
  // Same action as Later.
  assert.match(src, /className="pwa-toast__close"\s*onClick=\{dismissInstallNudge\}/);
  // 44×44 target + visible focus, and title padding so they never collide.
  assert.match(css, /\.pwa-toast__close\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
  assert.match(css, /\.pwa-toast__close:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(css, /\.pwa-toast__title\s*\{[\s\S]*?padding-right:/);
});

// ---- Fallback browsers (no native prompt) ------------------------------------

test('browsers without a native prompt get manual instructions, no How?', () => {
  // Instructions render whenever the native prompt is not (or no longer)
  // available; the wording is retained.
  assert.match(src, /canPrompt && !nativePromptFailed \? null : \(/);
  assert.match(src, /Use your browser’s Share or menu button/);
  assert.match(src, /On iPhone and iPad, use Safari’s Share/);
  // The established Settings route stays for the fallback.
  assert.match(src, /onClick=\{openInstallSettings\}[\s\S]*?Open Settings/);
});

test('an unavailable native prompt degrades gracefully, not a dead button', () => {
  // If Install now finds no prompt, force the manual/Settings fallback.
  assert.match(src, /else if \(outcome === 'unavailable'\) setNativePromptFailed\(true\)/);
});

// ---- Untouched siblings ------------------------------------------------------

test('the update-available and offline-ready toasts are unchanged', () => {
  assert.match(src, /role="alertdialog" aria-label="Update available"/);
  assert.match(src, /A new version of Fjällkompis is available\./);
  assert.match(src, /Update now/);
  assert.match(src, /Fjällkompis is ready for offline use\./);
  // Only the INSTALL toast gets a close button: the class appears exactly
  // once in the component, so it cannot have leaked onto the update or
  // offline-ready toasts.
  const closes = src.match(/pwa-toast__close/g) ?? [];
  assert.equal(closes.length, 1, 'exactly one close control, in the install toast');
  assert.match(src, /aria-label="Close installation prompt"/);
});
