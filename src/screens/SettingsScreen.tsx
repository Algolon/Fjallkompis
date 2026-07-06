import { useRef, useState } from 'react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { APP_VERSION } from '../constants';
import { buildExport, downloadJson, parseImport } from '../utils/exportImport';
import { todayIso } from '../utils/format';
import { OfflineMapCard, SatelliteMapCard } from '../components/OfflineMapCard';
import { CreditsSheet } from '../components/CreditsSheet';

type Notice = { kind: 'ok' | 'err'; text: string } | null;

function pwaStatus(): string {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const swControlled =
    'serviceWorker' in navigator && !!navigator.serviceWorker.controller;

  if (standalone && swControlled) return 'Installed · offline-ready';
  if (swControlled) return 'Offline-ready (in browser tab)';
  if (standalone) return 'Installed (service worker starting…)';
  return 'Browser tab · install from the share/▾ menu for offline use';
}

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
    <div className="screen">
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
        <div className="row-between" style={{ marginTop: 8 }}>
          <span className="muted">PWA</span>
          <span style={{ textAlign: 'right', maxWidth: '60%' }}>{pwaStatus()}</span>
        </div>
      </div>

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
      <CreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />

      <p className="app-version">Fjällkompis · prototype · v{APP_VERSION}</p>
    </div>
  );
}
