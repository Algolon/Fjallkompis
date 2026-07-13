import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { APP_VERSION } from '../constants';
import { buildExport, downloadCsv, downloadJson, parseImport } from '../utils/exportImport';
import { todayIso } from '../utils/format';
import { PACKING_CATEGORIES } from '../data/packingSeed.mjs';
import { seedPersonalList } from '../utils/stateMigration.mjs';
import {
  MAX_INPUT_BYTES,
  buildImportPreview,
  buildPackingCsv,
  buildTemplateCsv,
  packingCsvFilename,
  packingTemplateFilename,
  parsePasted,
  rowsToPackingItems,
} from '../utils/packingSpreadsheet.mjs';
import type { PackingImportPreview } from '../utils/packingSpreadsheet.mjs';
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
  | 'packing'
  | 'backup'
  | 'sources'
  | 'advanced';

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

/**
 * Compact, accessible confirmation dialog for a direction change. Focus is
 * moved to the primary action on open; Escape and the backdrop cancel. No new
 * design language — reuses the app's button and card classes.
 */
function ConfirmDialog({
  title,
  body,
  primaryLabel,
  onConfirm,
  onCancel,
  tone = 'default',
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 'danger' styles the primary action for a destructive confirmation. */
  tone?: 'default' | 'danger';
  /** Optional extra action (e.g. "Export current list first"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div
        className="card confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
      >
        <span id="confirm-title" className="card-title">{title}</span>
        <p id="confirm-body" className="card-sub" style={{ marginTop: 6 }}>
          {body}
        </p>
        {secondaryLabel && onSecondary ? (
          <button className="btn btn-block" style={{ marginTop: 12 }} onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
        <div className="row" style={{ marginTop: secondaryLabel ? 10 : 14, gap: 10 }}>
          <button
            ref={confirmRef}
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            style={{ flex: 1 }}
            onClick={onConfirm}
          >
            {primaryLabel}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
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

/**
 * Import / export / restore for the personal packing list. Editing individual
 * items lives on the Packing screen; this section is purely data management,
 * built on the same SettingsAccordion + ConfirmDialog language. Everything is
 * local — no packing data ever leaves the device.
 */
function PackingDataCard({
  open,
  onToggle,
  onNotice,
}: {
  open: boolean;
  onToggle: () => void;
  onNotice: (n: Notice) => void;
}) {
  const { state, replacePackingList, resetPackingProgress, restoreDefaultPacking } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<{ result: PackingImportPreview; source: string } | null>(
    null,
  );
  const [restoreOpen, setRestoreOpen] = useState(false);

  const itemCount = state.packing.length;

  const exportList = () => {
    downloadCsv(
      packingCsvFilename(todayIso()),
      buildPackingCsv(state.packing, PACKING_CATEGORIES, state.packingSections),
    );
    onNotice({ kind: 'ok', text: 'Packing list exported.' });
  };

  const downloadTemplate = () => {
    downloadCsv(
      packingTemplateFilename(),
      buildTemplateCsv(seedPersonalList(), PACKING_CATEGORIES),
    );
    onNotice({ kind: 'ok', text: 'Spreadsheet template downloaded.' });
  };

  const runPreview = (text: string, source: string) => {
    if (text.length > MAX_INPUT_BYTES) {
      onNotice({ kind: 'err', text: 'That file is too large to import.' });
      return;
    }
    const result = buildImportPreview(parsePasted(text), PACKING_CATEGORIES);
    setPreview({ result, source });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) {
      onNotice({ kind: 'err', text: 'That file is too large to import.' });
      return;
    }
    try {
      runPreview(await file.text(), file.name);
    } catch {
      onNotice({ kind: 'err', text: 'That file could not be read.' });
    }
  };

  const confirmImport = () => {
    if (!preview || preview.result.validCount === 0) return;
    const items = rowsToPackingItems(preview.result.rows);
    replacePackingList(items, preview.result.customSections);
    setPreview(null);
    setPasteText('');
    onNotice({
      kind: 'ok',
      text: `Imported ${items.length} item${items.length === 1 ? '' : 's'} — your previous list was replaced.`,
    });
  };

  const doRestore = () => {
    restoreDefaultPacking();
    setRestoreOpen(false);
    onNotice({ kind: 'ok', text: 'Fjällkompis default packing list restored.' });
  };

  return (
    <SettingsAccordion
      id="packing"
      title="Packing list data"
      summary="Import, export or restore your personal packing list"
      open={open}
      onToggle={onToggle}
    >
      <p className="card-sub" style={{ marginTop: 0 }}>
        Your packing list stays on this device. Export or import it as a
        spreadsheet, or restore the Fjällkompis default. Editing individual items
        happens on the Packing screen.
      </p>

      <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={exportList}>
        Export packing list
      </button>
      <button className="btn btn-block" style={{ marginTop: 10 }} onClick={downloadTemplate}>
        Download template
      </button>

      <div className="section-label" style={{ marginTop: 16 }}>
        Import a spreadsheet
      </div>
      <p className="card-sub" style={{ marginTop: 0 }}>
        Open the template in Excel, Numbers or Google Sheets, then save it and
        choose it here — or copy rows from your spreadsheet and paste them below.
        Importing <strong>replaces</strong> your current list; every imported
        item starts as “Needed”.
      </p>

      <button
        className="btn btn-block"
        style={{ marginTop: 10 }}
        onClick={() => fileRef.current?.click()}
      >
        Choose spreadsheet file
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain,text/tab-separated-values"
        style={{ display: 'none' }}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <label className="field" style={{ marginTop: 10 }}>
        <span>Or paste rows from a spreadsheet</span>
        <textarea
          className="input"
          rows={3}
          placeholder="Paste copied spreadsheet rows here…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
      </label>
      <button
        className="btn btn-block"
        style={{ marginTop: 10 }}
        disabled={pasteText.trim() === ''}
        onClick={() => runPreview(pasteText, 'pasted rows')}
      >
        Preview pasted rows
      </button>

      {preview ? (
        <div className="card import-preview" style={{ marginTop: 14 }}>
          <span className="card-title">Import preview</span>
          <p className="card-sub" style={{ marginTop: 4 }}>
            From {preview.source}: <strong>{preview.result.validCount}</strong> item
            {preview.result.validCount === 1 ? '' : 's'} across{' '}
            {preview.result.sectionCount} section
            {preview.result.sectionCount === 1 ? '' : 's'}.
          </p>

          {preview.result.warnings.length > 0 ? (
            <ul className="import-notes">
              {preview.result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          {preview.result.skipped.length > 0 ? (
            <>
              <p className="card-sub" style={{ marginTop: 8 }}>
                Skipped {preview.result.skipped.length} row
                {preview.result.skipped.length === 1 ? '' : 's'}:
              </p>
              <ul className="import-notes import-notes--skip">
                {preview.result.skipped.slice(0, 20).map((s, i) => (
                  <li key={i}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {preview.result.validCount === 0 ? (
            <p className="banner-warn" style={{ marginTop: 12 }}>
              <span>⚠️</span>
              <span>No valid items found — nothing will be imported.</span>
            </p>
          ) : (
            <p className="banner-warn" style={{ marginTop: 12 }}>
              <span>⚠️</span>
              <span>
                This replaces your current list of {itemCount} item
                {itemCount === 1 ? '' : 's'}. Export it first if you want to keep it.
              </span>
            </p>
          )}

          <button className="btn btn-block" style={{ marginTop: 10 }} onClick={exportList}>
            Export current list first
          </button>
          <div className="row" style={{ marginTop: 10, gap: 10 }}>
            <button
              className="btn btn-danger"
              style={{ flex: 1 }}
              onClick={confirmImport}
              disabled={preview.result.validCount === 0}
            >
              Replace my list
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="section-label" style={{ marginTop: 16 }}>
        Reset &amp; restore
      </div>
      <button
        className="btn btn-block"
        onClick={() => {
          if (confirm('Reset all packing progress? Your customized list will be kept.')) {
            resetPackingProgress();
            onNotice({ kind: 'ok', text: 'Packing progress reset — every item is “Needed”.' });
          }
        }}
      >
        Reset packing progress
      </button>
      <p className="card-sub" style={{ marginTop: 6 }}>
        Marks every item as “Needed” while keeping your customized list.
      </p>

      <button
        className="btn btn-danger btn-block"
        style={{ marginTop: 12 }}
        onClick={() => setRestoreOpen(true)}
      >
        Restore default packing list
      </button>
      <p className="card-sub" style={{ marginTop: 6 }}>
        Replaces your list with a fresh copy of the Fjällkompis default. Removes
        your custom items and edits.
      </p>

      {restoreOpen ? (
        <ConfirmDialog
          title="Restore the Fjällkompis default packing list?"
          body="This removes your custom items and edits and replaces the list with a fresh copy of the Fjällkompis default. Every item returns to “Needed”."
          primaryLabel="Restore default"
          tone="danger"
          secondaryLabel="Export current list first"
          onSecondary={exportList}
          onConfirm={doRestore}
          onCancel={() => setRestoreOpen(false)}
        />
      ) : null}
    </SettingsAccordion>
  );
}

export function SettingsScreen() {
  const { state, storageOk, replaceState, resetAll } = useStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  // Route direction is the primary setting: its accordion is the ONE section
  // open on load. Trail readiness (its own independent state) and the grouped
  // foldouts below start collapsed, so exactly one section is open initially.
  const [directionOpen, setDirectionOpen] = useState(true);
  const [readinessOpen, setReadinessOpen] = useState(false);
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

      {/* Route direction — the primary setting: first, and the one section open
          on load. It lives in the same accordion/card system as everything
          below (independent open state, like Trail readiness). */}
      <SettingsAccordion
        id="direction"
        title="Route direction"
        summary="Walk Abisko → Nikkaluokta or the reverse"
        open={directionOpen}
        onToggle={() => setDirectionOpen((current) => !current)}
      >
        <RouteDirectionCard />
      </SettingsAccordion>

      <TrailReadinessCard
        storageOk={storageOk}
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

        <PackingDataCard
          open={openSection === 'packing'}
          onToggle={() => toggleSection('packing')}
          onNotice={setNotice}
        />

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
