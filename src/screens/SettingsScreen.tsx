import { useRef, useState, type ReactNode } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ROUTE_DIRECTIONS } from '../route/direction.mjs';
import { getActiveItinerary } from '../route/activeItinerary';
import type { RouteDirection } from '../types';
import { ScreenHeader } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { APP_VERSION } from '../constants';
import { buildExport, downloadJson, parseImport } from '../utils/exportImport';
import { readState } from '../utils/storage';
import { clearWalletData, dumpWalletData, replaceWalletData } from '../wallet/walletStore.mjs';
import {
  backupFileName,
  backupSummaryText,
  restoreRejectionText,
} from '../backup/completeBackup.mjs';
import {
  buildCompleteBackup,
  stageCompleteBackup,
  type StagedBackup,
} from '../backup/completeBackupArchive.mjs';
import { applyCompleteRestore } from '../backup/completeBackupRestore.mjs';
import { saveBackupFile } from '../runtime/backupFile';
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
import { TRAIL_CAVEATS, trailDossierView } from '../trail/activeTrailContent';
import { SCHEMA_VERSION } from '../utils/stateMigration.mjs';
import { buildDiagnosticSummary } from '../utils/diagnosticSummary.mjs';

type Notice = { kind: 'ok' | 'err'; text: string } | null;
type SettingsSection = 'install' | 'maps' | 'backup' | 'sources';
/** One-shot deep-link targets (NavPayload.settings) — readiness only for now. */
export type SettingsDeepLinkSection = 'readiness';

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
          // A superseded archive still counts as ready — it works offline —
          // but the row must not read as up to date; the Offline maps panel
          // below is where the update itself lives. Unusable stored data is
          // NOT ready and says so rather than showing its size.
          value={
            basemap.needsRepair
              ? 'Needs repair'
              : basemap.updateAvailable
                ? 'Update available'
                : basemap.downloaded
                  ? formatBytes(basemap.sizeBytes)
                  : 'Not stored'
          }
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
  const { routeDirection, setRouteDirection, currentStage, dayPlan } = useStore();
  const [pending, setPending] = useState<RouteDirection | null>(null);

  const request = (dir: RouteDirection) => {
    if (dir === routeDirection) return; // never confirm the active direction
    // A current stage (or live progress), or a personal hiking-day plan, makes
    // the change consequential — ask first. With neither, apply immediately.
    if (currentStage || dayPlan) setPending(dir);
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
          title={dayPlan ? 'Remove day plan and change direction?' : 'Change route direction?'}
          body={
            dayPlan
              ? 'Your day plan describes a journey in the current direction — which stages you walk, where each day ends, where you stay and when you travel. It cannot be reused the other way round, so it will be removed. Your packing list, Trip plan, documents, journal and stop notes stay unchanged.'
              : 'Stages and progress will be reordered for the new direction. Your packing list, journal and stop notes will stay unchanged. Any live tracking on the Map stops.'
          }
          primaryLabel={dayPlan ? 'Remove day plan and change direction' : 'Change direction'}
          destructive={dayPlan != null}
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
  // Shared aggregate (same hook the Trail readiness card reads) — reused by
  // the diagnostic summary so both surfaces report identical asset states.
  const readiness = useTrailReadiness();
  // Every Settings section starts collapsed for a consistent, scannable list
  // (Route direction is still first; its collapsed summary shows the current
  // choice). Route direction and Trail readiness each own an independent
  // boolean; the grouped foldouts below share a single-open group — same
  // shared SettingsAccordion behaviour, no section is open on load unless a
  // one-shot deep link asked for it. (The Day plan moved to Plan — vNext.)
  const [directionOpen, setDirectionOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(initialSection === 'readiness');
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = () => {
    downloadJson(`fjallkompis-backup-${todayIso()}.json`, buildExport(state));
    setNotice({ kind: 'ok', text: 'Backup downloaded.' });
  };

  // ---- Complete backup (state + the actual Wallet PDF/image files) --------
  //
  // All reads go through the wallet storage adapter (dumpWalletData — one
  // consistent transaction), the package is built by the platform-agnostic
  // backup layer, and only the final "hand the file to the user" step is
  // platform-specific (saveBackupFile). A backup that cannot include every
  // document file REFUSES with the documents named — never a silent partial.
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<
    (StagedBackup & { formattedSize: string }) | null
  >(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  const doCompleteExport = async () => {
    setBackupBusy(true);
    try {
      const { documents, files } = await dumpWalletData();
      const fileBytesById = new Map<string, Uint8Array | null>();
      for (const [id, blob] of files) {
        fileBytesById.set(id, blob ? new Uint8Array(await blob.arrayBuffer()) : null);
      }
      const result = await buildCompleteBackup({
        exportEnvelope: buildExport(state),
        documents,
        fileBytesById,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
      });
      if (!result.ok) {
        const affected = result.documents ?? [];
        const names = affected.map((d) => `“${d.title}”`).join(', ');
        setNotice({
          kind: 'err',
          text:
            affected.length === 1
              ? `A complete backup must include every document file. ${names} has no stored file on this device — replace its file or remove the document, then export again.`
              : `A complete backup must include every document file. These documents have no stored file on this device: ${names}. Replace their files or remove them, then export again.`,
        });
        return;
      }
      const blob = new Blob([result.bytes as BlobPart], { type: 'application/zip' });
      const outcome = await saveBackupFile(backupFileName(todayIso()), blob);
      if (outcome === 'saved') {
        setNotice({
          kind: 'ok',
          text: `Complete backup saved — ${backupSummaryText(
            result.manifest.counts.walletDocuments,
            formatBytes(blob.size),
          )}. It contains your personal document files; store it somewhere private.`,
        });
      }
    } catch (err) {
      console.warn('Fjällkompis: complete backup failed.', err);
      setNotice({ kind: 'err', text: 'Could not create the complete backup. Nothing was saved.' });
    } finally {
      setBackupBusy(false);
    }
  };

  const onBackupFile = async (file: File | undefined) => {
    if (!file) return;
    setBackupBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const staged = await stageCompleteBackup(bytes, readState);
      if (!staged.ok) {
        setNotice({ kind: 'err', text: restoreRejectionText(staged) });
        return;
      }
      // Everything is validated and held in memory; nothing stored has
      // changed. The confirmation dialog below is what may apply it.
      const totalBytes = [...staged.walletFiles.values()].reduce(
        (sum, f) => sum + f.bytes.byteLength,
        0,
      );
      setRestoreCandidate({ ...staged, formattedSize: formatBytes(totalBytes) });
    } catch (err) {
      console.warn('Fjällkompis: could not read the backup file.', err);
      setNotice({ kind: 'err', text: restoreRejectionText('unreadable-archive') });
    } finally {
      setBackupBusy(false);
    }
  };

  const doCompleteRestore = async () => {
    const staged = restoreCandidate;
    setRestoreCandidate(null);
    if (!staged) return;
    setBackupBusy(true);
    try {
      const result = await applyCompleteRestore(staged, {
        snapshotWallet: dumpWalletData,
        replaceWallet: replaceWalletData,
        applyState: replaceState,
        toStoredFiles: (candidateFiles) =>
          new Map(
            [...candidateFiles].map(([id, f]) => [
              id,
              new Blob([f.bytes as BlobPart], { type: f.mimeType }),
            ]),
          ),
      });
      if (result.ok) {
        setNotice({
          kind: 'ok',
          text: `Backup restored — trip data and ${result.restoredDocuments} document${
            result.restoredDocuments === 1 ? '' : 's'
          } replaced what was on this device.`,
        });
      } else if (result.reason === 'wallet-write-failed') {
        setNotice({
          kind: 'err',
          text: 'The documents could not be written (possibly out of storage space). Nothing was changed.',
        });
      } else {
        setNotice({
          kind: 'err',
          text: result.rolledBack
            ? 'Applying the backup failed, so your previous data was put back unchanged.'
            : 'Applying the backup failed, and restoring your previous documents also failed. Your trip data is unchanged; check the documents in Plan → Wallet.',
        });
      }
    } catch (err) {
      console.warn('Fjällkompis: restore failed.', err);
      setNotice({ kind: 'err', text: 'The restore failed unexpectedly.' });
    } finally {
      setBackupBusy(false);
    }
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
        'Reset all local data? This clears your packing list, trip plan, stop notes, journal and current stage, and permanently removes the documents stored on this device. Export a complete backup first if unsure — it is the only backup that includes the stored document files.',
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

  // "Copy diagnostic summary" — pilot helper. Only whitelisted TECHNICAL
  // facts reach the builder (see diagnosticSummary.mjs): versions, schema,
  // platform, direction and offline asset states. Never notes, trip data,
  // documents or anything personal.
  const assetStatus = (asset: {
    downloaded: boolean;
    sizeBytes: number | null;
    checking: boolean;
  }) =>
    asset.checking
      ? 'checking'
      : asset.downloaded
        ? `stored (${formatBytes(asset.sizeBytes ?? 0)})`
        : 'not stored';

  const doCopyDiagnostics = async () => {
    const dossier = trailDossierView();
    const summary = buildDiagnosticSummary({
      appVersion: APP_VERSION,
      content: `${dossier.contentVersion} (${dossier.name})`,
      schemaVersion: SCHEMA_VERSION,
      routeDirection: directionLabel(routeDirection),
      platform: navigator.userAgent,
      displayMode: window.matchMedia?.('(display-mode: standalone)').matches
        ? 'standalone'
        : 'browser',
      serviceWorker: readiness.swControlled ? 'active' : 'not controlling',
      storage: readiness.storageOk ? 'available' : 'unavailable',
      offlineBasemap: readiness.basemap.needsRepair
        ? 'needs repair'
        : assetStatus(readiness.basemap),
      terrain: assetStatus(readiness.terrain),
      satellite: assetStatus(readiness.satellite),
    });
    try {
      await navigator.clipboard.writeText(summary);
      setNotice({
        kind: 'ok',
        text: 'Diagnostic summary copied — paste it into your report.',
      });
    } catch {
      setNotice({
        kind: 'err',
        text: 'Could not copy automatically. Long-press to copy the app version below instead.',
      });
    }
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
          {/* The extended navigation caveat opens the panel that decides what
              the map can do offline — the moment a hiker is deliberately
              preparing to rely on it. The Map cockpit and the stage guide
              footer carry the one-line version of the same statement; this is
              the only place with room for why. No new Settings section for it:
              the honest home is the map the caveat is about.

              Deliberately OUTSIDE .settings-panel-stack. That stack draws its
              separator with `> * + *`, and the cards' first element is an
              INLINE .card-title span — as a second child it would take a top
              border and padding it cannot lay out, and "Offline map" would
              overlap this text. Kept as a sibling, the cards' own sequence is
              exactly what it was. */}
          <p className="card-sub" style={{ margin: '0 0 16px' }}>
            {TRAIL_CAVEATS.navigation.full}
          </p>
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
          <span className="card-title">Complete backup</span>
          <p className="card-sub" style={{ marginTop: 4 }}>
            Everything needed to restore this Fjällkompis setup on another install or
            device — trip data AND the document PDFs and images stored in your Wallet.
            The file contains your personal documents, so store it somewhere private.
            Restoring replaces what is currently on this device.
          </p>

          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 }}
            onClick={() => void doCompleteExport()}
            disabled={backupBusy}
          >
            Export complete backup
          </button>
          <button
            className="btn btn-block"
            style={{ marginTop: 10 }}
            onClick={() => backupFileRef.current?.click()}
            disabled={backupBusy}
          >
            Restore complete backup
          </button>
          {/* Android's save picker may append ".zip" to the .fjallkompis name
              (SAF normalises unknown extensions to the declared MIME type),
              so the restore picker accepts both shapes; validation reads the
              manifest, never the filename. */}
          <input
            ref={backupFileRef}
            type="file"
            accept=".fjallkompis,.zip,application/zip,application/octet-stream"
            style={{ display: 'none' }}
            onChange={(e) => {
              void onBackupFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <span className="card-title" style={{ display: 'block', marginTop: 18 }}>
            Data export
          </span>
          <p className="card-sub" style={{ marginTop: 4 }}>
            Lightweight JSON with trip data and settings only — Wallet document files
            are NOT inside it. Import merges nothing — it replaces current trip data
            with the file’s contents; after importing on another device, items list any
            missing documents honestly so you can re-attach them there.
          </p>

          <button className="btn btn-block" style={{ marginTop: 10 }} onClick={doExport}>
            Export data (.json)
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

        {restoreCandidate ? (
          <ConfirmDialog
            title="Replace this device’s data?"
            body={`This backup contains ${backupSummaryText(
              restoreCandidate.walletDocuments.length,
              restoreCandidate.formattedSize,
            )} (exported ${restoreCandidate.manifest.exportedAt.slice(0, 10)}). Restoring replaces your current trip data and every stored Wallet document on this device.`}
            primaryLabel="Replace and restore"
            destructive
            onConfirm={() => void doCompleteRestore()}
            onCancel={() => setRestoreCandidate(null)}
          />
        ) : null}

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

      {/* Pilot feedback helper: one tap copies the technical facts a report
          needs (versions, platform, offline asset states) — nothing personal. */}
      <button
        className="btn btn-ghost btn-block"
        style={{ marginTop: 14 }}
        onClick={() => void doCopyDiagnostics()}
      >
        <Copy size={15} strokeWidth={1.8} aria-hidden /> Copy diagnostic summary
      </button>

      <p className="app-version">Fjällkompis · prototype · v{APP_VERSION}</p>
    </div>
  );
}
