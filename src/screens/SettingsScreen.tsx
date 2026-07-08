import { useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { APP_VERSION } from '../constants';
import { buildExport, downloadJson, parseImport } from '../utils/exportImport';
import { todayIso } from '../utils/format';
import { OfflineMapCard, SatelliteMapCard } from '../components/OfflineMapCard';
import { REPOSITORY_URL } from '../data/attribution';
import { CreditsSheet } from '../components/CreditsSheet';
import { InstallCard } from '../components/InstallCard';

type Notice = { kind: 'ok' | 'err'; text: string } | null;

export function SettingsScreen() {
  const { state, storageOk, replaceState, resetAll } = useStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = () => {
    downloadJson(`fjallkompis-backup-${todayIso()}.json`, buildExport(state));
    setNotice({ kind: 'ok', text: 'Backup downloaded.' });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const result = parseImport(text);
    if (!result.ok) {
      setNotice({ kind: 'err', text: result.error });
      return;
    }
    replaceState(result.state);
    setNotice({
      kind: 'ok',
      text: 'Imported your trip data and settings.',
    });
  };

  const doReset = () => {
    if (
      confirm(
        'Reset all local data? This clears your daily list, packing list, stop notes and current stage. Export a backup first if unsure.',
      )
    ) {
      resetAll();
      setNotice({ kind: 'ok', text: 'Local data reset to defaults.' });
    }
  };

  return (
    <div className="screen screen--settings">
      <ScreenHeader eyebrow="Your data stays on this device" title="Settings">
        No account, no server. Everything lives in this browser — back it up
        before you wipe your phone.
      </ScreenHeader>

      {notice ? (
        <div
          className={`banner-warn`}
          style={{
            marginBottom: 14,
            background: notice.kind === 'ok' ? '#dfe9db' : undefined,
            borderColor: notice.kind === 'ok' ? '#c4d4be' : undefined,
            color: notice.kind === 'ok' ? '#46603f' : undefined,
          }}
        >
          <span>{notice.kind === 'ok' ? '✓' : '⚠️'}</span>
          <span>{notice.text}</span>
        </div>
      ) : null}

      {/* .settings-grid is layout-neutral on compact (plain block, cards
          keep their stacked margins); at ≥900px it becomes a two-column
          card grid (global.css). Section order is unchanged. */}
      <div className="settings-grid">
      <div className="card">
        <span className="card-title">Status</span>
        <div className="row-between" style={{ marginTop: 10 }}>
          <span className="muted">App version</span>
          <span className="tnum">{APP_VERSION}</span>
        </div>
        <div className="row-between" style={{ marginTop: 8 }}>
          <span className="muted">Local storage</span>
          <span>{storageOk ? 'Available' : 'Unavailable (data won’t persist)'}</span>
        </div>
      </div>

      <InstallCard />

      <div className="card">
        <span className="card-title">Backup & restore</span>
        <p className="card-sub" style={{ marginTop: 4 }}>
          Export before trips and OS updates. Import merges nothing — it replaces
          current data with the file’s contents.
        </p>

        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={doExport}>
          Export all data (JSON)
        </button>

        <button
          className="btn btn-block"
          style={{ marginTop: 10 }}
          onClick={() => fileRef.current?.click()}
        >
          Import data from JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <button className="btn btn-danger btn-block" style={{ marginTop: 10 }} onClick={doReset}>
          Reset local data
        </button>
      </div>

      <OfflineMapCard />

      <SatelliteMapCard />

      <div className="card">
        <span className="card-title">Feedback (beta)</span>
        <p className="card-sub" style={{ marginTop: 4 }}>
          Testing Fjällkompis? Problems, GPS oddities and ideas are all
          welcome — mention your app version ({APP_VERSION}) and device, and
          please don’t include exact GPS coordinates.
        </p>
        <a
          className="btn btn-block"
          style={{ marginTop: 12, textDecoration: 'none' }}
          href={`${REPOSITORY_URL}/issues/new?template=beta-feedback.yml`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Give feedback on GitHub
        </a>
        <p className="card-sub" style={{ marginTop: 8 }}>
          Opens a short pre-structured form (a free GitHub account is needed
          to submit). No account? Send your feedback through whatever channel
          you received the app link from.
        </p>
      </div>

      <div className="card">
        <span className="card-title">Data sources &amp; credits</span>
        <p className="card-sub" style={{ marginTop: 4 }}>
          Information about the maps, imagery, route data and open-source software
          used in Fjällkompis.
        </p>
        <button
          className="btn btn-block"
          style={{ marginTop: 12 }}
          onClick={() => setCreditsOpen(true)}
        >
          View sources and licences
        </button>
      </div>
      </div>
      <CreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />

      <p className="app-version">Fjällkompis · prototype · v{APP_VERSION}</p>
    </div>
  );
}
