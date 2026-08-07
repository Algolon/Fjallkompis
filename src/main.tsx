import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {
  dismissNativeBootVeil,
  initializeNativeShell,
  markRuntimeOnDocument,
} from './runtime/platform';
import './styles/global.css';
import './styles/map-popup-polish.css';
import './styles/today-polish.css';
import './styles/mobile-shell-plan-polish.css';
import './styles/section-themes.css';

// Stamp <html data-runtime="…"> BEFORE the first render. Every native-only
// style rule is scoped under that attribute, so setting it after mount would
// paint one frame of browser chrome and then reflow into the native insets.
// In a browser or installed PWA this writes 'web'/'pwa' and nothing else
// changes — no native rule matches those values.
markRuntimeOnDocument();
// System-bar icon contrast; resolves immediately to a no-op off-Android.
void initializeNativeShell();

if (import.meta.env.DEV) {
  // Development-only route-data diagnostics (mirrors the generator output).
  void import('./route/routeData').then(({ ROUTE, ROUTE_DIAGNOSTICS }) => {
    console.groupCollapsed('[fjällkompis] GPX route diagnostics');
    console.log('track:', ROUTE.name);
    console.log('diagnostics:', ROUTE_DIAGNOSTICS);
    console.table(
      ROUTE.stages.map((s) => ({
        day: s.day,
        from: s.fromWaypointId,
        to: s.toWaypointId,
        km: s.statistics.distanceKm,
        'ascent m': s.statistics.totalAscentM,
        'descent m': s.statistics.totalDescentM,
        points: s.points.length,
      })),
    );
    console.groupEnd();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Native shell only (the element exists solely in the native index.html):
// fade the boot veil out once the first rendered frame is on screen. Must be
// called AFTER render() so the double-rAF inside lands behind React's first
// commit, not before it.
dismissNativeBootVeil();
