/**
 * "Data sources & credits" — accessible bottom sheet opened from Settings.
 *
 * Native <dialog> gives us focus trapping, Esc-to-close and a backdrop for
 * free. Content derives from the central attribution registry
 * (src/data/attribution.ts); only sources whose data actually ships in the
 * app (`present: true`) are listed, so future providers (e.g. Lantmäteriet)
 * appear automatically once their archives exist.
 */
import { useEffect, useRef } from 'react';
import {
  PRESENT_DATA_SOURCES,
  SOFTWARE_CREDITS,
  TRIP_INFO_SOURCES,
  REPOSITORY_URL,
} from '../data/attribution';
import { APP_VERSION } from '../constants';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

export function CreditsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
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

        <span className="section-label">Map &amp; imagery data</span>
        <ul className="credits-list">
          {PRESENT_DATA_SOURCES.map((s) => (
            <li key={s.id}>
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
          ))}
        </ul>

        <span className="section-label">Trip information (shops &amp; transport)</span>
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
