import { useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { APP_VERSION } from '../constants';
import { buildExport, downloadJson, parseImport } from '../utils/exportImport';
import { todayIso } from '../utils/format';
import {
  CONTOURS_ARCHIVE,
  OfflineMapCard,
  SATELLITE_ARCHIVE,
  SatelliteMapCard,
  TERRAIN_ARCHIVE,
  TerrainReliefCard,
  VECTOR_ARCHIVE,
  formatBytes,
  useCombinedArchiveStatus,
} from '../components/OfflineMapCard';
import { REPOSITORY_URL } from '../data/attribution';
import { CreditsSheet } from '../components/CreditsSheet';
import {
  InstallCard,
  installStatusText,
  useServiceWorkerControlled,
} from '../components/InstallCard';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

type Notice = { kind: 'ok' | 'err'; text: string } | null;
type SettingsSection =
  | 'install'
  | 'maps'
  | 'backup'
  | 'sources'
  | 'advanced';

const BETA_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdKmFYZ4uRrfcqc5dPlF1VgxFcggMjtFVl8WQyLtebGokUllg/viewform';

function checkLabel(done: boolean, pending = false): string {
  if (pending) return 'Checking…';
  return done ? 'Ready' : 'Needs attention';
}

function ReadinessRow({
  label,
  value,
  done,
  optional = false,
  pending = false,
}: {
  label: string;
  value: string;
  done: boolean;
  optional?: boolean;
  pending?: boolean;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <div className="readiness-row">
      <Icon size={18} strokeWidth={2.1} aria-hidden />
      <div className="readiness-row__main">
        <span>{label}</span>
        <small>{optional ? 'Optional' : checkLabel(done, pending)}</small>
      </div>
      <span className="readiness-row__value">{value}</span>
    </div>
  );
}

function TrailReadinessCard({
  storageOk,
  open,
  onToggle,
}: {
  storageOk: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { installed } = useInstallPrompt();
  const swControlled = useServiceWorkerControlled();
  const basemap = useCombinedArchiveStatus([VECTOR_ARCHIVE]);
  const terrain = useCombinedArchiveStatus([TERRAIN_ARCHIVE, CONTOURS_ARCHIVE]);
  const satellite = useCombinedArchiveStatus([SATELLITE_ARCHIVE]);

  const requiredChecks = [
    installed,
    storageOk,
    swControlled,
    basemap.downloaded,
  ];
  const passed = requiredChecks.filter(Boolean).length;
  const pending = basemap.checking || terrain.checking || satellite.checking;
  const ready = passed === requiredChecks.length;

  // The score lives in the collapsed header, so the readiness status stays
  // visible without expanding the panel — computed once, shown in both places.
  const score = (
    <span className="readiness-score">
      <strong>{passed}/{requiredChecks.length}</strong>
      <span>{pending ? 'Checking' : ready ? 'Ready' : 'Setup'}</span>
    </span>
  );

  return (
    <SettingsAccordion
      id="readiness"
      title="Trail readiness"
      summary="Local checks for beta testing and offline trail preparation."
      open={open}
      onToggle={onToggle}
      aside={score}
      className={`readiness-card ${ready ? 'is-ready' : ''}`}
    >
      <div className="readiness-list">
        <ReadinessRow
          label="App installed"
          value={installed ? 'Yes' : 'No'}
          done={installed}
        />
        <ReadinessRow
          label="App shell"
          value={installStatusText(installed, swControlled)}
          done={swControlled}
        />
        <ReadinessRow
          label="Local storage"
          value={storageOk ? 'Available' : 'Unavailable'}
          done={storageOk}
        />
        <ReadinessRow
          label="Offline basemap"
          value={basemap.downloaded ? formatBytes(basemap.sizeBytes) : 'Not stored'}
          done={basemap.downloaded}
          pending={basemap.checking}
        />
        <ReadinessRow
          label="Terrain relief"
          value={terrain.downloaded ? formatBytes(terrain.sizeBytes) : 'Not stored'}
          done={terrain.downloaded}
          optional
          pending={terrain.checking}
        />
        <ReadinessRow
          label="Satellite imagery"
          value={satellite.downloaded ? formatBytes(satellite.sizeBytes) : 'Not stored'}
          done={satellite.downloaded}
          optional
          pending={satellite.checking}
        />
        <ReadinessRow
          label="GPS"
          value="Manual field test"
          done={false}
          optional
        />
      </div>

      <p className="readiness-note">
        Airplane-mode, sunlight, glove and reopen checks still need a real device.
      </p>
    </SettingsAccordion>
  );
}

function SettingsAccordion({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
  aside,
  className = '',
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Optional element shown in the header, before the chevron (e.g. a score). */
  aside?: ReactNode;
  className?: string;
}) {
  const panelId = `settings-panel-${id}`;
  const buttonId = `settings-heading-${id}`;
  return (
    <section className={`card settings-accordion ${open ? 'is-open' : ''} ${className}`.trim()}>
      <h2 className="settings-accordion__heading">
        <button
          type="button"
          id={buttonId}
          className="settings-accordion__button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="settings-accordion__label">
            <span className="settings-accordion__title">{title}</span>
            <span className="settings-accordion__summary">{summary}</span>
          </span>
          {aside}
          <ChevronDown className="settings-accordion__chevron" size={20} aria-hidden />
        </button>
      </h2>
      {open ? (
        <div
          id={panelId}
          className="settings-accordion__panel"
          role="region"
          aria-labelledby={buttonId}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function BetaFeedbackCard() {
  return (
    <div className="card beta-card">
      <span className="card-title">Beta testing</span>
      <p className="card-sub" style={{ marginTop: 4 }}>
        Send confusing moments, wrong facts, GPS oddities and readiness gaps. The
        no-login feedback form opens in your browser.
      </p>

      <a
        className="btn btn-primary btn-block"
        style={{ marginTop: 12, textDecoration: 'none' }}
        href={BETA_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink size={16} aria-hidden /> Report beta feedback
      </a>

      <a
        className="btn btn-block"
        style={{ marginTop: 10, textDecoration: 'none' }}
        href={`${REPOSITORY_URL}/issues/new?template=beta-feedback.yml`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink size={16} aria-hidden /> GitHub feedback
      </a>
    </div>
  );
}

export function SettingsScreen() {
  const { state, storageOk, replaceState, resetAll } = useStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [openSection, setOpenSection] = useState<SettingsSection | null>('install');
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
        'Reset all local data? This clears your packing list, stop notes, journal and current stage. Export a backup first if unsure.',
      )
    ) {
      resetAll();
      setNotice({ kind: 'ok', text: 'Local data reset to defaults.' });
    }
  };

  const toggleSection = (id: SettingsSection) => {
    setOpenSection((current) => (current === id ? null : id));
  };

  return (
    <div className="screen screen--settings">
      <ScreenHeader eyebrow="Beta trust & trail readiness" title="Settings">
        Check whether this device is ready for offline testing, then use the
        detailed sections below when you need to change something.
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

      <TrailReadinessCard
        storageOk={storageOk}
        open={readinessOpen}
        onToggle={() => setReadinessOpen((current) => !current)}
      />

      <BetaFeedbackCard />

      <p className="settings-foldout-note">
        Beta feedback stays visible above. Trail readiness and the remaining
        settings are grouped as foldouts; tap a section to expand its options.
      </p>

      <div className="settings-grid settings-grid--accordions">
        <SettingsAccordion
          id="install"
          title="Install"
          summary="App shell, home-screen install and offline app behavior"
          open={openSection === 'install'}
          onToggle={() => toggleSection('install')}
        >
          <InstallCard embedded />
        </SettingsAccordion>

        <SettingsAccordion
          id="maps"
          title="Offline maps"
          summary="Basemap, terrain relief and optional satellite downloads"
          open={openSection === 'maps'}
          onToggle={() => toggleSection('maps')}
        >
          <div className="settings-panel-stack">
            <OfflineMapCard embedded />
            <TerrainReliefCard embedded />
            <SatelliteMapCard embedded />
          </div>
        </SettingsAccordion>

        <SettingsAccordion
          id="backup"
          title="Backup & restore"
          summary="Export, import or reset local trip data"
          open={openSection === 'backup'}
          onToggle={() => toggleSection('backup')}
        >
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
        </SettingsAccordion>

        <SettingsAccordion
          id="sources"
          title="Data sources"
          summary="Map, imagery, route and software credits"
          open={openSection === 'sources'}
          onToggle={() => toggleSection('sources')}
        >
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
        </SettingsAccordion>

        <SettingsAccordion
          id="advanced"
          title="Advanced"
          summary="Version and manual test reminders"
          open={openSection === 'advanced'}
          onToggle={() => toggleSection('advanced')}
        >
          <span className="card-title">Advanced status</span>
          <div className="row-between" style={{ marginTop: 10 }}>
            <span className="muted">App version</span>
            <span className="tnum">{APP_VERSION}</span>
          </div>
          <div className="row-between" style={{ marginTop: 8 }}>
            <span className="muted">Manual checks</span>
            <span style={{ textAlign: 'right' }}>Airplane mode · sunlight · gloves</span>
          </div>
        </SettingsAccordion>
      </div>

      <CreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />

      <p className="app-version">Fjällkompis · prototype · v{APP_VERSION}</p>
    </div>
  );
}
