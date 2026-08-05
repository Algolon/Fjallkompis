/**
 * "Data sources & credits" — accessible bottom sheet opened from Settings.
 *
 * Native <dialog> gives us focus trapping, Esc-to-close and a backdrop for
 * free. Content derives from the central attribution registry
 * (src/data/attribution.ts); only sources whose data actually ships in the
 * app (`present: true`) are listed, so future providers (e.g. Lantmäteriet)
 * appear automatically once their archives exist.
 *
 * The sheet answers two different questions and now says so: what the TRAIL
 * dossier is built on (route, facilities, shops, transport) and what the APP
 * is built on (map providers, software, release). Every previously listed
 * source, licence and link is still here — only the grouping changed.
 */
import { useEffect, useRef } from 'react';
// App-scoped credits stay with the attribution registry; the trail dossier's
// own sources and publication identity come from the trail content boundary.
import { APP_DATA_SOURCES, SOFTWARE_CREDITS, REPOSITORY_URL } from '../data/attribution';
import type { DataSourceAttribution } from '../data/attribution';
import {
  TRAIL_DATA_SOURCES,
  TRIP_INFO_SOURCES,
  trailDossierView,
} from '../trail/activeTrailContent';
import { APP_VERSION } from '../constants';
import { formatVerifiedDate } from '../utils/format';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

/** One attribution entry — identical markup wherever a source is listed. */
function SourceEntry({ source: s }: { source: DataSourceAttribution }) {
  return (
    <li>
      <span className="credits-name">{s.name}</span>
      <p className="credits-text">{s.attribution}</p>
      {s.modifiedNotice ? <p className="credits-text">{s.modifiedNotice}.</p> : null}
      <p className="credits-links">
        {s.licenseName ? (
          <>
            Licence:{' '}
            {s.licenseUrl ? (
              <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer">
                {s.licenseName}
              </a>
            ) : (
              s.licenseName
            )}
            {' · '}
          </>
        ) : null}
        {s.sourceUrl ? (
          <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
            {s.provider}
          </a>
        ) : (
          s.provider
        )}
      </p>
    </li>
  );
}

export function CreditsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const dossier = trailDossierView();
  useOverlayScrollLock(open);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="credits-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop targets the <dialog> element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2 id="credits-title">Data sources &amp; credits</h2>
          <button className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <span className="section-label">Trail dossier</span>
        <div className="credits-app">
          <div className="row-between">
            <span className="muted">Trail</span>
            <span>{dossier.name}</span>
          </div>
          <div className="row-between" style={{ marginTop: 6 }}>
            <span className="muted">{dossier.contentVersionLabel}</span>
            <span className="tnum">{dossier.contentVersion}</span>
          </div>
          {/*
            Only rendered when the WHOLE dossier was demonstrably reviewed as
            one piece. It is null today, and nothing here fills the gap with a
            "checked" or "up to date" claim — see the honesty note in
            src/data/trailMetadata.mjs.
          */}
          {dossier.fullyReviewedOn ? (
            <div className="row-between" style={{ marginTop: 6 }}>
              <span className="muted">Fully reviewed</span>
              <span>{formatVerifiedDate(dossier.fullyReviewedOn)}</span>
            </div>
          ) : null}
          <p className="credits-text" style={{ marginTop: 10 }}>
            The version of the curated trail content in this build — route, stops,
            guides, shops and transport. It changes when that content is republished,
            not with every app update. Individual facts carry their own verification
            date on the stop, guide or timetable they belong to.
          </p>
        </div>

        <span className="section-label">Trail sources — route &amp; facilities</span>
        <ul className="credits-list">
          {TRAIL_DATA_SOURCES.map((s) => (
            <SourceEntry key={s.id} source={s} />
          ))}
        </ul>

        <span className="section-label">Trail sources — shops &amp; transport</span>
        <ul className="credits-list">
          {TRIP_INFO_SOURCES.map((s) => (
            <li key={s.name}>
              <span className="credits-name">
                {s.name}{' '}
                <span className={`pill ${s.kind === 'live' ? 'pill-glacier' : ''}`}>
                  {s.kind === 'live' ? 'Live' : 'Static'}
                </span>
              </span>
              <p className="credits-text">{s.detail}</p>
              <p className="credits-links">
                <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {s.provider}
                </a>
              </p>
            </li>
          ))}
        </ul>

        <span className="section-label">App &amp; map credits</span>
        <ul className="credits-list">
          {APP_DATA_SOURCES.map((s) => (
            <SourceEntry key={s.id} source={s} />
          ))}
        </ul>

        <span className="section-label">Software</span>
        <ul className="credits-list">
          {SOFTWARE_CREDITS.map((s) => (
            <li key={s.name}>
              <span className="credits-name">{s.name}</span>
              <p className="credits-links">
                {s.role} ·{' '}
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.licenseName}
                </a>
              </p>
            </li>
          ))}
        </ul>

        <span className="section-label">Fjällkompis</span>
        <div className="credits-app">
          <div className="row-between">
            <span className="muted">App version</span>
            <span className="tnum">{APP_VERSION}</span>
          </div>
          <div className="row-between" style={{ marginTop: 6 }}>
            <span className="muted">Design &amp; development</span>
            <span>Omar</span>
          </div>
          <div className="row-between" style={{ marginTop: 6 }}>
            <span className="muted">Repository</span>
            <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
              Algolon/Fjallkompis
            </a>
          </div>
          <p className="credits-text" style={{ marginTop: 10 }}>
            Downloaded map archives are stored locally on this device (browser cache
            storage) so the map keeps working without a connection. They never leave
            your device and can be removed at any time from Settings.
          </p>
        </div>
      </div>
    </dialog>
  );
}
