# In-app PDF viewer — evidence run

Wallet PDFs now render **inside Fjallkompis** on every platform
(`WalletPdfViewer` on pdf.js), replacing the #146 native `ACTION_VIEW`
hand-off to an external viewer app. This directory is the scripted
Chromium evidence for the two runnable targets in this environment; the
Capacitor WebView itself ships the same Chromium engine and the exact
`dist` bundle exercised here, but the emulator/Samsung pass is still owed
(no Android SDK or emulator was available in this container — the Android
Gradle Plugin download is blocked by the environment's network policy).

Both flows drive the REAL app through the Wallet UI: add a two-page PDF →
open → both pages painted on canvases → close returns to the Wallet →
reopen/Escape-close → corrupt PDF shows the honest error with **Save a
copy** → an image ticket still opens the in-app image sheet. Instrumented
`window.open` and popup listeners recorded **zero** external navigations.

| file | what it shows |
| --- | --- |
| `native-dist-*.png` | the `--mode native` bundle (the exact content the Android WebView loads: root base, no service worker), mobile-emulated Chromium |
| `pwa-offline-*.png` | the web/PWA bundle served under `/Fjallkompis/`, service worker installed, then **network cut** — the whole flow repeated fully offline |
| `results.json` | the machine-read assertions from both flows (page counts, painted-pixel checks, error text, popup/window.open counts) |

Canvas checks in `results.json`: page 1 renders at 776×1098 device pixels
(fit-to-width × capped devicePixelRatio) with ~2000 dark pixels — real
glyphs, not a blank canvas.
