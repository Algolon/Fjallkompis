# Persistent pre-initialized Map workspace (P1) — lifecycle evidence

P0 (deferred bundled-basemap warm-up + first-useful-render reveal) produced
no perceived improvement on the physical Samsung. The remaining dominant cost
was architectural: `Screens()` renders only the active destination, so every
deliberate Map open still paid MapView mount → archive resolution → the
MapLibre constructor → style/tile load → first useful render, on the
user-visible critical path — and leaving the tab destroyed it all again.

P1 turns the Map into a persistent workspace (`MapWorkspace.tsx`), mounted
once in the deferred startup phase and only *activated* by navigation. This
directory records the proof, captured by `capture-lifecycle.mjs` from the
app's own dev instrumentation (`window.__fjallkompisMapWorkspace`,
`data-map-lifecycle`) against a real headless Chromium.

## What the capture proved (`lifecycle-results.json`)

**Scenario 1 — background init, then a 9-stop tab tour.** The app was
loaded on `#/today` and left there. With **zero activations**, the workspace
mounted, resolved its archives, constructed the map and reached first useful
render — inactive, `aria-hidden="true"`, `inert`, invisible. The full
per-map trace ran off the tap path (map-local ms): constructor 17.7 →
`load` 542.5 → `ready-first-useful-render` 624.8. Then a full tour
(Map → Today → Map → Guide → Map → Plan → Map → Settings → Map) ended with:

```
workspaceMounts: 1   mapConstructors: 1
activations: 5       deactivations: 4
activationsWhileReady: 5
```

The MapLibre constructor count is **1 for the whole session** — tab
switching constructs nothing. Every Map tap found the map already ready;
activation is a visibility flip plus one `map.resize()`.

**Scenario 2 — the user beats the background init.** Navigating to `#/map`
immediately on load activated the same in-flight workspace
(`activationsWhileInitializing: 1`), and the session still ended with
`mapConstructors: 1` — no second map is ever started.

No console errors in either scenario. The script asserts all of the above
and exits non-zero on regression.

## Honest caveats

- Wall-clock numbers here are headless desktop Chromium against the Vite
  dev server (unbundled module loading inflates absolute times). They prove
  the **architecture** — which work moved off the tap path — not Samsung
  milliseconds. Device timing comes from the physical-device test plan in
  the PR.
- The one sanctioned rebuild (walking-direction change → `key={direction}`
  remount, second constructor) is fenced by
  `tests/map-persistent-workspace.test.mjs` rather than captured here.

## Reproduce

```
npm run dev -- --port 4750 --strictPort
APP_URL=http://localhost:4750/Fjallkompis/ node capture-lifecycle.mjs
# point PLAYWRIGHT_MODULE at a playwright install if none resolves locally
```
