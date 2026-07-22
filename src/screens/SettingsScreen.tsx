import { useRef, useState, type ReactNode } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ROUTE_DIRECTIONS } from '../route/direction.mjs';
import { getActiveItinerary } from '../route/activeItinerary';
import type { RouteDirection } from '../types';
import { ScreenHeader } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { APP_VERSION } from '../constants';
import { buildExport, downloadJson, parseImport } from '../utils/exportImport';
import { clearWalletData } from '../wallet/walletStore.mjs';
import { todayIso } from '../utils/format';
import {
  OfflineMapCard,
  SatelliteMapCard,
  TerrainReliefCard,
  formatBytes,
} from '../components/OfflineMapCard';
import { CreditsSheet } from '../components/CreditsSheet';
import { InstallCard, installStatusText } from '../components/InstallCard';
import { useTrailReadiness } from '../hooks/useTrailReadiness';

type Notice = { kind: 'ok' | 'err'; text: string } | null;
type SettingsSection = 'install' | 'maps' | 'backup' | 'sources';
/** One-shot deep-link targets (NavPayload.settings) — readiness only for now. */
export type SettingsDeepLinkSection = 'readiness';

const BETA_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdKmFYZ4uRrfcqc5dPlF1VgxFcggMjtFVl8WQyLtebGokUllg/viewform';

/** Human label for a direction, sourced from its itinerary (single source). */
function directionLabel(direction: RouteDirection): string {
  return getActiveItinerary(direction).displayName;
}

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
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  // The shared aggregate (also read by the Today Prepare card) — criteria and
  // scoring live in useTrailReadiness so the surfaces can never disagree.
  const {
    passed,
    required,
    ready,
    pending,
    installed,
    swControlled,
    storageOk,
    basemap,
    terrain,
    satellite,
  } = useTrailReadiness();

  // The score lives in the collapsed header, so the readiness status stays
  // visible without expanding the panel — computed once, shown in both places.
  const score = (
    <span className="readiness-score">
      <strong>{passed}/{required}</strong>
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

/**
 * Route direction chooser — an accessible radio group over the two supported
 * directions, rendered inside the Route direction accordion. Changing direction
 * reorders stages, stops, elevation profiles and progress; a confirmation
 * dialog appears first whenever a current stage is selected (personal data is
 * never touched).
 */
function RouteDirectionCard() {
  const { routeDirection, setRouteDirection, currentStage } = useStore();
  const [pending, setPending] = useState<RouteDirection | null>(null);

  const request = (dir: RouteDirection) => {
    if (dir === routeDirection) return; // never confirm the active direction
    // A current stage (or live progress) makes the change consequential — ask
    // first. With nothing selected, apply immediately.
    if (currentStage) setPending(dir);
    else setRouteDirection(dir);
  };

  return (
    <>
      <p className="card-sub" style={{ marginTop: 0 }}>
        Choose the direction you are walking. Stages, stops, elevation profiles
        and progress will follow this sequence.
      </p>

      <div
        className="direction-group"
        role="radiogroup"
        aria-label="Route direction"
        style={{ marginTop: 12 }}
      >
        {ROUTE_DIRECTIONS.map((dir) => {
          const selected = dir === routeDirection;
          return (
            <label
              key={dir}
              className={`direction-option${selected ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="route-direction"
                value={dir}
                checked={selected}
                onChange={() => request(dir)}
              />
              <span className="direction-option__label">{directionLabel(dir)}</span>
              <Check
                className="direction-option__check"
                size={18}
                strokeWidth={2.4}
                aria-hidden
              />
            </label>
          );
        })}
      </div>

      {pending ? (
        <ConfirmDialog
          title="Change route direction?"
          body="Stages and progress will be reordered for the new direction. Your packing list, journal and stop notes will stay unchanged. Any live tracking on the Map stops."
          primaryLabel="Change direction"
          onConfirm={() => {
            setRouteDirection(pending);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
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
    </div>
  );
}

export function SettingsScreen({
  initialSection = null,
}: {
  /** One-shot deep link (e.g. Today Prepare's readiness card): open this
   *  section on arrival. Plain tab navigation keeps everything collapsed. */
  initialSection?: SettingsDeepLinkSection | null;
}) {
  const { state, replaceState, resetAll, routeDirection } = useStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  // Every Settings section starts collapsed for a consistent, scannable list
  // (Route direction is still first; its collapsed summary shows the current
  // choice). Route direction and Trail readiness each own an independent
  // boolean; the grouped foldouts below share a single-open group — same
  // shared SettingsAccordion behaviour, no section is open on load unless a
  // one-shot deep link asked for it.
  const [directionOpen, setDirectionOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(initialSection === 'readiness');
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null);
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

  const doReset = async () => {
    if (
      !confirm(
        'Reset all local data? This clears your packing list, trip plan, stop notes, journal and current stage, and permanently removes the documents stored on this device. Export a backup first if unsure — stored document files are not part of the JSON backup.',
      )
    ) {
      return;
    }
    // The state blob (localStorage) and stored documents (IndexedDB) are
    // cleared independently; a document-storage failure must not be reported
    // as a clean reset.
    resetAll();
    try {
      await clearWalletData();
      setNotice({ kind: 'ok', text: 'Local data reset to defaults.' });
    } catch (err) {
      console.warn('Fjällkompis: could not clear document storage.', err);
      setNotice({
        kind: 'err',
        text: 'Trip data was reset, but the stored documents could not be removed. Try again, or clear the site data in your browser settings.',
      });
    }
  };

  const toggleSection = (id: SettingsSection) => {
    setOpenSection((current) => (current === id ? null : id));
  };

  return (
    <div className="screen screen--settings">
      <ScreenHeader eyebrow="Trail readiness" title="Settings">
        Adjust app settings to tailor Fjällkompis to your trip and how you use
        it. Tap a section to expand its options.
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

      {/* Route direction — the primary setting: first, but collapsed by default
          like every other section. Its summary shows the current choice so the
          selected direction stays visible without expanding. Same accordion/card
          system as everything below (independent open state, like Trail
          readiness). */}
      <SettingsAccordion
        id="direction"
        title="Route direction"
        summary={`Walking ${directionLabel(routeDirection)}`}
        open={directionOpen}
        onToggle={() => setDirectionOpen((current) => !current)}
      >
        <RouteDirectionCard />
      </SettingsAccordion>

      <TrailReadinessCard
        open={readinessOpen}
        onToggle={() => setReadinessOpen((current) => !current)}
      />

      <BetaFeedbackCard />

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
            current data with the file’s contents. The backup includes your Trip plan’s
            travel and stay items; the document FILES are stored
            separately on this device and are not included in this backup file. After a
            restore on another device, items list any missing documents honestly so you
            can re-attach them there.
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
      </div>

      <CreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />

      <p className="app-version">Fjällkompis · prototype · v{APP_VERSION}</p>
    </div>
  );
}
