# Guide → Weather prototype — evidence

Captured from the production build (`vite preview`) in Chromium at the named
viewports. This container's egress proxy blocks `*.smhi.se`, so the SMHI
responses behind the "Update forecast" captures were mocked with generated
snow1g-shaped fixture data at the network layer — the app still runs its real
fetch → validate → normalise → persist (IndexedDB) → render pipeline. The
values shown are therefore NOT live SMHI forecasts; everything about the UI,
states and storage behaviour is real. 29/29 scripted checks passed
(routing, Back/refresh restore, date re-render, direction reversal, offline
reload, stale notice, failed-update retention, Today unchanged).
