import { useState } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { ScreenHeader } from '../components/ui';
import { ShopInfoView, ShopInfoHelp } from '../components/ShopInfoView';
import { TransportView, TransportHelp } from '../components/TransportView';
import { CreditsSheet } from '../components/CreditsSheet';
import {
  ACTIVE_TRAIL_CONTENT,
  trailDossierView,
} from '../trail/activeTrailContent';
import type { GuideSection, NavTarget } from '../components/TabBar';
import type { NavPayload } from './TodayScreen';
import type { ShopCategory, TransportContext } from '../types';

/**
 * Guide — the read-only trail dossier's home: an index into the curated
 * route content (stages, places, highlights, resupply, transport, sources),
 * every fact behind it served by ACTIVE_TRAIL_CONTENT.
 *
 * Read-only by design: browsing the dossier never writes personal state.
 * The personal actions that live INSIDE its sections (Add to trip, stop
 * notes, Set as current stage) belong to those screens, exactly as before
 * vNext; the dossier itself only tells you about the trail.
 */

/** One index row: a Guide section (or the Sources sheet) and why to open it. */
interface GuideIndexRow {
  id: string;
  section: GuideSection | null; // null → the Sources & credits sheet
  title: string;
  sub: string;
}

export function GuideScreen({
  onOpenSection,
}: {
  onOpenSection: (section: GuideSection) => void;
}) {
  const dossier = trailDossierView();
  const [creditsOpen, setCreditsOpen] = useState(false);

  const stageCount = ACTIVE_TRAIL_CONTENT.route.stages.length;
  const stopCount = ACTIVE_TRAIL_CONTENT.places.stops.length;
  const placeCount = ACTIVE_TRAIL_CONTENT.places.offRoute.length;

  const rows: GuideIndexRow[] = [
    {
      id: 'stages',
      section: 'stages',
      title: 'Stages',
      sub: `${stageCount} stages with distances, terrain and day guides`,
    },
    {
      id: 'stops',
      section: 'stops',
      title: 'Stops & places',
      sub: `${stopCount} route stops and ${placeCount} ${placeCount === 1 ? 'place' : 'places'} nearby — facilities, shops, transport links`,
    },
    {
      id: 'highlights',
      section: 'stages',
      title: 'Highlights & detours',
      sub: 'Inside each stage: viewpoints, side trips and expeditions',
    },
    {
      id: 'shops',
      section: 'shops',
      title: 'Shops & resupply',
      sub: 'What the cabin shops normally carry, and where to restock',
    },
    {
      id: 'transport',
      section: 'transport',
      title: 'Transport',
      sub: 'Buses, boats and the train to and from the trail',
    },
    {
      id: 'sources',
      section: null,
      title: 'Sources & credits',
      sub: 'Where this dossier’s facts come from',
    },
  ];

  return (
    <div className="screen screen--guide">
      <ScreenHeader eyebrow="Trail dossier" title="Guide">
        {dossier.name} — the trail itself, for reading: route, places,
        supplies and transport. Your own plans live under Plan.
      </ScreenHeader>

      <nav className="stack" aria-label="Guide sections">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="card index-row"
            onClick={() =>
              row.section ? onOpenSection(row.section) : setCreditsOpen(true)
            }
          >
            <span className="index-row__main">
              <span className="index-row__title">{row.title}</span>
              <span className="index-row__sub">{row.sub}</span>
            </span>
            <ChevronRight className="index-row__chevron" size={20} aria-hidden />
          </button>
        ))}
      </nav>

      <CreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} />

      {/* An edition marker, not a freshness claim — a whole-dossier review
          date deliberately does not exist (see trailMetadata.mjs HONESTY
          NOTE); per-fact verification dates stay on the records themselves. */}
      <p className="app-version">
        <BookOpen size={13} strokeWidth={2} aria-hidden />{' '}
        {dossier.contentVersionLabel} {dossier.contentVersion}
      </p>
    </div>
  );
}

/**
 * Guide → Shops & resupply: the reference view that lived in Lists, now a
 * dossier section. The copy and the ShopInfoView are unchanged.
 */
export function GuideShopsScreen({
  initialShopType,
}: {
  initialShopType?: ShopCategory;
}) {
  return (
    <div className="screen screen--guide-section">
      <ScreenHeader eyebrow="Trail dossier" title="Shops & resupply" action={<ShopInfoHelp />}>
        Compare the shop types relevant to this route and see what STF Large
        and Small cabin shops normally carry. Assortments and prices are
        planning references, not live stock.
      </ScreenHeader>
      <ShopInfoView initialShopType={initialShopType} />
    </div>
  );
}

/**
 * Guide → Transport: the reference view that lived in Lists. Its two
 * personal actions cross into Plan → Trip with the same one-shot launch
 * payloads the Lists screen used to hand over internally.
 */
export function GuideTransportScreen({
  initialEntryId,
  initialContext,
  onNavigate,
}: {
  initialEntryId?: string;
  initialContext?: TransportContext;
  onNavigate: (tab: NavTarget, payload?: NavPayload) => void;
}) {
  return (
    <div className="screen screen--guide-section">
      <ScreenHeader eyebrow="Trail dossier" title="Transport" action={<TransportHelp />}>
        Buses, boats and the train for this route — static 2026 planning
        snapshots, always confirmed against the official source.
      </ScreenHeader>
      <TransportView
        initialEntryId={initialEntryId}
        initialContext={initialContext}
        onAddToTrip={(entryId) =>
          onNavigate('plan', { lists: { addTransportEntryId: entryId } })
        }
        onViewInTrip={(itemId) =>
          onNavigate('plan', { lists: { tripItemId: itemId } })
        }
      />
    </div>
  );
}
