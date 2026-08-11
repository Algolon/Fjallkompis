import { useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ROUTE_DIRECTIONS } from '../route/direction.mjs';
import { getActiveItinerary } from '../route/activeItinerary';
import type { RouteDirection } from '../types';
import { ScreenHeader } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { APP_VERSION } from '../constants';
import { buildExport, parseImport } from '../utils/exportImport';
import { readState } from '../utils/storage';
import { clearWalletData, dumpWalletData, replaceWalletData } from '../wallet/walletStore.mjs';
import {
  backupFileName,
  backupSummaryText,
  preflightBackupFile,
  restoreRejectionText,
} from '../backup/completeBackup.mjs';
import {
  buildCompleteBackup,
  stageCompleteBackup,
  type StagedBackup,
} from '../backup/completeBackupArchive.mjs';
import { applyCompleteRestore } from '../backup/completeBackupRestore.mjs';
import { saveGeneratedFile } from '../runtime/fileSave';
import { todayIso } from '../utils/format';
import {
  OfflineMapCard,
  SatelliteMapCard,
  TerrainReliefCard,
  formatBytes,
} from '../components/OfflineMapCard';
import { CreditsSheet } from '../components/CreditsSheet';
import { useOfflineDiagnostics } from '../hooks/useOfflineDiagnostics';
import { TRAIL_CAVEATS, trailDossierView } from '../trail/activeTrailContent';
import { SCHEMA_VERSION } from '../utils/stateMigration.mjs';
import { buildDiagnosticSummary } from '../utils/diagnosticSummary.mjs';
import { PRIVACY_POLICY_URL } from '../privacy/privacyPolicy.mjs';
import { packingSummary } from '../utils/packingModel.mjs';

type Notice = { kind: 'ok' | 'err'; text: string } | null;
type SettingsSection = 'readiness' | 'maps' | 'backup' | 'sources' | 'privacy';

/** Human label for a direction, sourced from its itinerary (single source). */
function directionLabel(direction: RouteDirection): string {
  return getActiveItinerary(direction).displayName;
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

export function SettingsScreen() {
  const { state, replaceState, resetAll, routeDirection } = useStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  // Offline asset states for the diagnostic summary. The same hook backs the
  // Offline maps cards, so a copied report can never disagree with what the
  // panel shows.
  const diagnostics = useOfflineDiagnostics();
  const packing = packingSummary(state.packing);
  // Every Settings section starts collapsed for a consistent, scannable list
  // (Route direction is still first; its collapsed summary shows the current
  // choice). Route direction owns an independent boolean; the grouped foldouts
  // below share a single-open group — same shared SettingsAccordion behaviour,
  // and no section is open on load. (The Day plan moved to Plan — vNext.)
  const [directionOpen, setDirectionOpen] = useState(false);
  const [openSection, setOpenSection] = useState<SettingsSection | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The SAME bytes downloadJson always produced (2-space JSON of the same
  // envelope), but delivered through the platform save boundary: browsers
  // keep the normal download, and the Android wrapper gets the system save
  // picker instead of the silent blob-URL no-op the WebView made of it.
  const doExport = async () => {
    try {
      const json = JSON.stringify(buildExport(state), null, 2);
      const outcome = await saveGeneratedFile(
        `fjallkompis-backup-${todayIso()}.json`,
        new Blob([json], { type: 'application/json' }),
        'application/json',
      );
      if (outcome === 'saved') setNotice({ kind: 'ok', text: 'Backup downloaded.' });
    } catch (err) {
      console.warn('Fjallkompis: JSON export failed.', err);
      setNotice({ kind: 'err', text: 'Could not save the export file.' });
    }
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
      const outcome = await saveGeneratedFile(
        backupFileName(todayIso()),
        blob,
        'application/zip',
      );
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
      console.warn('Fjallkompis: complete backup failed.', err);
      setNotice({ kind: 'err', text: 'Could not create the complete backup. Nothing was saved.' });
    } finally {
      setBackupBusy(false);
    }
  };

  const onBackupFile = async (file: File | undefined) => {
    if (!file) return;
    // Container preflight BEFORE any bytes are read: a huge selection must
    // be refused from its size alone, not after arrayBuffer() has already
    // allocated it (MAX_BACKUP_FILE_BYTES in the backup contract).
    const preflight = preflightBackupFile(file.size);
    if (!preflight.ok) {
      setNotice({ kind: 'err', text: restoreRejectionText(preflight) });
      return;
    }
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
      console.warn('Fjallkompis: could not read the backup file.', err);
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
      console.warn('Fjallkompis: restore failed.', err);
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
      console.warn('Fjallkompis: could not clear document storage.', err);
      setNotice({
        kind: 'err',
        text: 'Trip data was reset, but the stored documents could not be removed. Try again, or clear the site data in your browser settings.',
      });
    }
  };

  const toggleSection = (id: SettingsSection) => {
    setOpenSection((current) => (current === id ? null : id));
  };

  const mapReadinessStatus = (
    asset: typeof diagnostics.basemap,
    optional = false,
  ): string => {
    if (asset.checking) return 'Checking…';
    if (asset.bundled) return 'Included';
    if (asset.downloaded) return 'Downloaded';
    return optional ? 'Optional · Not downloaded' : 'Not downloaded';
  };

  const packingReadiness =
    packing.total === 0 || !state.packing.some((item) => item.essential)
      ? 'No essentials marked'
      : packing.essentialNotPacked === 0
        ? 'All essentials packed or worn'
        : `${packing.essentialNotPacked} essential${
            packing.essentialNotPacked === 1 ? '' : 's'
          } remaining`;

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
      serviceWorker: diagnostics.swControlled ? 'active' : 'not controlling',
      storage: diagnostics.storageOk ? 'available' : 'unavailable',
      offlineBasemap: diagnostics.basemap.needsRepair
        ? 'needs repair'
        : assetStatus(diagnostics.basemap),
      terrain: assetStatus(diagnostics.terrain),
      satellite: assetStatus(diagnostics.satellite),
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
      <ScreenHeader eyebrow="This device" title="Settings">
        Route direction, offline maps, backups and what Fjallkompis stores on
        this device.
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

      <div className="settings-grid settings-grid--accordions">
        <SettingsAccordion
          id="readiness"
          title="Trail Readiness"
          summary="Offline maps, packing and trail preparation"
          open={openSection === 'readiness'}
          onToggle={() => toggleSection('readiness')}
        >
          <div className="readiness-facts" aria-label="Trail readiness facts">
            <div className="readiness-fact">
              <span className="readiness-fact__label">Default basemap</span>
              <span className="readiness-fact__value">
                {mapReadinessStatus(diagnostics.basemap)}
              </span>
            </div>
            <div className="readiness-fact">
              <span className="readiness-fact__label">Terrain relief</span>
              <span className="readiness-fact__value">
                {mapReadinessStatus(diagnostics.terrain, true)}
              </span>
            </div>
            <div className="readiness-fact">
              <span className="readiness-fact__label">Satellite</span>
              <span className="readiness-fact__value">
                {mapReadinessStatus(diagnostics.satellite, true)}
              </span>
            </div>
            <div className="readiness-fact">
              <span className="readiness-fact__label">Packing</span>
              <span className="readiness-fact__value">{packingReadiness}</span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost readiness-maps-link"
            onClick={() => setOpenSection('maps')}
          >
            Open Offline maps
          </button>

          <p className="trail-responsibility-note">
            {TRAIL_CAVEATS.navigation.full}
          </p>
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
          <span className="card-title">Complete backup</span>
          <p className="card-sub" style={{ marginTop: 4 }}>
            Everything needed to restore this Fjallkompis setup on another install or
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

          <button
            className="btn btn-block"
            style={{ marginTop: 10 }}
            onClick={() => void doExport()}
          >
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
            used in Fjallkompis.
          </p>
          <button
            className="btn btn-block"
            style={{ marginTop: 12 }}
            onClick={() => setCreditsOpen(true)}
          >
            View sources and licences
          </button>

          {/* Support helper, deliberately low-prominence and deliberately
              HERE: this is the panel that already answers "what is this build
              made of", so the technical facts a bug report needs belong
              alongside it rather than as a full-width action under every
              other setting. One tap copies versions, platform and offline
              asset states — nothing personal. */}
          <p className="card-sub" style={{ marginTop: 16 }}>
            Reporting a problem? Copy the technical details of this build —
            versions, platform and which map data is downloaded. It contains
            nothing personal.
          </p>
          <button
            className="btn btn-ghost"
            style={{ marginTop: 8 }}
            onClick={() => void doCopyDiagnostics()}
          >
            <Copy size={14} strokeWidth={1.8} aria-hidden /> Copy technical details
          </button>
        </SettingsAccordion>

        {/* PRIVACY. One entry, the same accordion as every section above — no
            new Settings idiom for it. It links OUT rather than restating the
            policy in-app on purpose: Google Play is given one public URL, and
            an in-app copy would be a second wording to keep in step with it.
            The canonical URL is the shared constant, so the web app and the
            Android WebView open the identical page (src/privacy/privacyPolicy.mjs).

            A plain <a target="_blank"> is the app's established external-link
            convention (Credits, transport operators, stop links). In the
            Android WebView Capacitor hands a target="_blank" navigation to the
            system browser, so this needs no native branch. */}
        <SettingsAccordion
          id="privacy"
          title="Privacy"
          summary="How Fjallkompis handles your data"
          open={openSection === 'privacy'}
          onToggle={() => toggleSection('privacy')}
        >
          <span className="card-title">Privacy policy</span>
          <p className="card-sub" style={{ marginTop: 4 }}>
            Your trip data and Wallet documents stay on this device. Fjallkompis has
            no accounts, no analytics and no tracking, and nothing you enter is sent
            anywhere. The full policy opens in your browser.
          </p>
          <a
            className="btn btn-block"
            style={{ marginTop: 12 }}
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the privacy policy
          </a>
        </SettingsAccordion>
      </div>

      <CreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />

      <p className="app-version">Fjallkompis · v{APP_VERSION}</p>
    </div>
  );
}
