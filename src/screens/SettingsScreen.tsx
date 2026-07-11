import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clipboard,
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
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { STOPS_BY_ID, stopShortName } from '../data/stops';

type Notice = { kind: 'ok' | 'err'; text: string } | null;
type SettingsSection =
  | 'install'
  | 'maps'
  | 'backup'
  | 'sources'
  | 'advanced';

const BETA_FORM_URL = '';

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
}: {
  storageOk: boolean;
}) {
  const { installed } = useInstallPrompt();
  const swControlled = useServiceWorkerControlled();
  const basemap = useCombinedArchiveStatus([VECTOR_ARCHIVE]);
  const terrain = useCombinedArchiveStatus([TERRAIN_ARCHIVE, CONTOURS_ARCHIVE]);
  const satellite = useCombinedArchiveStatus([SATELLITE_ARCHIVE]);

  const requiredChecks = [
    storageOk,
    swControlled,
    basemap.downloaded,
  ];
  const passed = requiredChecks.filter(Boolean).length;
  const pending = basemap.checking || terrain.checking || satellite.checking;
  const ready = passed === requiredChecks.length;

  return (
    <div className={`card readiness-card ${ready ? 'is-ready' : ''}`}>
      <div className="readiness-card__head">
        <div>
          <span className="card-title">Trail readiness</span>
          <p className="card-sub">
            Local checks for beta testing and offline trail preparation.
          </p>
        </div>
        <div className="readiness-score">
          <strong>{passed}/{requiredChecks.length}</strong>
          <span>{pending ? 'Checking' : ready ? 'Ready' : 'Setup'}</span>
        </div>
      </div>

      <div className="readiness-list">
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
    </div>
  );
}

function SettingsAccordion({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: SettingsSection;
  title: string;
  summary: string;
  open: boolean;
  onToggle: (id: SettingsSection) => void;
  children: ReactNode;
}) {
  const panelId = `settings-panel-${id}`;
  return (
    <section className={`card settings-accordion ${open ? 'is-open' : ''}`}>
      <h2 className="settings-accordion__heading">
        <button
          type="button"
          className="settings-accordion__button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(id)}
        >
          <span>
            <span className="settings-accordion__title">{title}</span>
            <span className="settings-accordion__summary">{summary}</span>
          </span>
          <ChevronDown className="settings-accordion__chevron" size={20} aria-hidden />
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="settings-accordion__panel" role="region">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function BetaFeedbackCard({
  diagnostics,
  onCopyDiagnostics,
}: {
  diagnostics: string;
  onCopyDiagnostics: () => void;
}) {
  return (
    <div className="card beta-card">
      <span className="card-title">Beta testing</span>
      <p className="card-sub" style={{ marginTop: 4 }}>
        Send confusing moments, wrong facts, GPS oddities and readiness gaps.
        Safe diagnostics add device/app status only; they exclude coordinates,
        notes, journal entries and checklist contents.
      </p>

      {BETA_FORM_URL ? (
        <a
          className="btn btn-primary btn-block"
          style={{ marginTop: 12, textDecoration: 'none' }}
          href={BETA_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} aria-hidden /> Report beta feedback
        </a>
      ) : (
        <p className="banner-warn beta-card__pending">
          <span>ⓘ</span>
          <span>The no-login beta form is waiting on the final Google Forms URL.</span>
        </p>
      )}

      <button className="btn btn-block" style={{ marginTop: 10 }} onClick={onCopyDiagnostics}>
        <Clipboard size={16} aria-hidden /> Copy safe diagnostics
      </button>

      <a
        className="btn btn-block"
        style={{ marginTop: 10, textDecoration: 'none' }}
        href={`${REPOSITORY_URL}/issues/new?template=beta-feedback.yml`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink size={16} aria-hidden /> GitHub feedback
      </a>

      <details className="diagnostics-preview">
        <summary>Show safe diagnostics preview</summary>
        <pre>{diagnostics}</pre>
      </details>
    </div>
  );
}

export function SettingsScreen() {
  const { state, storageOk, currentStage, replaceState, resetAll } = useStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const online = useOnlineStatus();
  const swControlled = useServiceWorkerControlled();
  const { installed } = useInstallPrompt();
  const basemap = useCombinedArchiveStatus([VECTOR_ARCHIVE]);
  const terrain = useCombinedArchiveStatus([TERRAIN_ARCHIVE, CONTOURS_ARCHIVE]);
  const satellite = useCombinedArchiveStatus([SATELLITE_ARCHIVE]);

  const currentStageLabel = currentStage
    ? `Day ${currentStage.day} · ${stopShortName(STOPS_BY_ID[currentStage.fromHutId])} → ${stopShortName(STOPS_BY_ID[currentStage.toHutId])}`
    : null;

  const diagnostics = useMemo(() => {
    const displayMode = installed ? 'standalone' : 'browser-tab';
    return [
      'Fjällkompis beta diagnostics',
      `App version: ${APP_VERSION}`,
      `URL: ${window.location.href}`,
      `Display mode: ${displayMode}`,
      `Service worker controlled: ${swControlled ? 'yes' : 'no'}`,
      `Online hint: ${online ? 'online' : 'offline'}`,
      `Local storage: ${storageOk ? 'available' : 'unavailable'}`,
      `Current stage: ${currentStageLabel ?? 'not selected'}`,
      `Offline basemap: ${basemap.downloaded ? `stored (${formatBytes(basemap.sizeBytes)})` : 'not stored'}`,
      `Terrain relief: ${terrain.downloaded ? `stored (${formatBytes(terrain.sizeBytes)})` : 'not stored'}`,
      `Satellite imagery: ${satellite.downloaded ? `stored (${formatBytes(satellite.sizeBytes)})` : 'not stored'}`,
      `Platform: ${navigator.platform || 'unknown'}`,
      `User agent: ${navigator.userAgent}`,
    ].join('\n');
  }, [
    basemap.downloaded,
    basemap.sizeBytes,
    currentStageLabel,
    installed,
    online,
    satellite.downloaded,
    satellite.sizeBytes,
    storageOk,
    swControlled,
    terrain.downloaded,
    terrain.sizeBytes,
  ]);

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

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setNotice({ kind: 'ok', text: 'Diagnostics copied.' });
    } catch {
      setNotice({
        kind: 'err',
        text: 'Could not copy diagnostics. Use the preview text instead.',
      });
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

      <TrailReadinessCard storageOk={storageOk} />

      <BetaFeedbackCard
        diagnostics={diagnostics}
        onCopyDiagnostics={() => {
          void copyDiagnostics();
        }}
      />

      <p className="settings-foldout-note">
        Trail readiness and beta feedback stay visible above. The remaining
        settings are grouped below; tap a section to expand its options.
      </p>

      <div className="settings-grid settings-grid--accordions">
        <SettingsAccordion
          id="install"
          title="Install"
          summary="App shell, home-screen install and offline app behavior"
          open={openSection === 'install'}
          onToggle={toggleSection}
        >
          <InstallCard embedded />
        </SettingsAccordion>

        <SettingsAccordion
          id="maps"
          title="Offline maps"
          summary="Basemap, terrain relief and optional satellite downloads"
          open={openSection === 'maps'}
          onToggle={toggleSection}
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
          onToggle={toggleSection}
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
          onToggle={toggleSection}
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
          onToggle={toggleSection}
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
