import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/map-popup-polish.css';

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
