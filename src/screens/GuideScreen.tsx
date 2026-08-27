import { BusFront, CloudSun, Signpost, ShoppingBasket } from 'lucide-react';
import { ScreenHeader } from '../components/ui';
import { IconHuts } from '../components/Icons';
import { ShopInfoView, ShopInfoHelp } from '../components/ShopInfoView';
import { TransportView, TransportHelp } from '../components/TransportView';
import { trailDossierView } from '../trail/activeTrailContent';
import type { GuideSection, NavTarget } from '../components/TabBar';
import type { NavPayload } from './TodayScreen';
import type { ShopCategory, TransportContext } from '../types';

/**
 * Guide — the read-only trail dossier's home: a 2×2 grid of the four
 * dossier categories plus the full-width Weather tile (prototype), every
 * curated fact behind them served by ACTIVE_TRAIL_CONTENT. Weather is the
 * one dossier section whose FACTS are external and refreshable (saved SMHI
 * forecasts, src/weather/) — its locations still come from the verified
 * trail stops.
 *
 * Read-only by design: browsing the dossier never writes personal state.
 * The personal actions that live INSIDE its sections (Add to trip, stop
 * notes, Set as current stage) belong to those screens, exactly as before
 * vNext; the dossier itself only tells you about the trail. Sources &
 * credits live in Settings — the dossier home stays a four-tile index.
 */

interface GuideTile {
  section: GuideSection;
  title: string;
  sub: string;
  icon: JSX.Element;
  /** Spans the full grid width (the odd fifth tile) instead of one column. */
  wide?: boolean;
}

const TILES: GuideTile[] = [
  {
    section: 'stages',
    title: 'Stages & highlights',
    sub: 'Day guides, terrain, viewpoints and side trips',
    icon: <Signpost size={22} strokeWidth={1.9} aria-hidden />,
  },
  {
    section: 'stops',
    title: 'Stops & places',
    sub: 'Huts, facilities and places near the route',
    icon: <IconHuts />,
  },
  {
    section: 'shops',
    title: 'Shops & supplies',
    sub: 'Food, fuel and resupply along the trail',
    icon: <ShoppingBasket size={22} strokeWidth={1.9} aria-hidden />,
  },
  {
    section: 'transport',
    title: 'Transport',
    sub: 'Buses, boats and trains to and from the trail',
    icon: <BusFront size={22} strokeWidth={1.9} aria-hidden />,
  },
  // Fifth tile, full-width below the 2×2 grid (prototype — see
  // docs/proposals/weather-section.md): weather is read-only trail
  // reference, so it belongs in the dossier, not in Today and not as a
  // sixth primary tab.
  {
    section: 'weather',
    title: 'Weather',
    sub: 'Saved route forecast for offline use',
    icon: <CloudSun size={22} strokeWidth={1.9} aria-hidden />,
    wide: true,
  },
];

export function GuideScreen({
  onOpenSection,
}: {
  onOpenSection: (section: GuideSection) => void;
}) {
  const dossier = trailDossierView();

  return (
    <div className="screen screen--guide guide-screen">
      {/* The glacier contour backdrop is rendered by the app shell
          (SectionBackdrop) so it persists across Guide's subroutes. */}
      {/* The four tiles below name themselves; the intro used to end by
          re-listing them ("— stages, places, supplies and transport"). */}
      <ScreenHeader eyebrow="Trail dossier" title="Guide">
        Trail information for preparing and hiking the {dossier.name}.
      </ScreenHeader>

      <nav className="guide-grid" aria-label="Guide sections">
        {TILES.map((tile) => (
          <button
            key={tile.section}
            type="button"
            className={`card today-glass today-glass--light guide-tile${
              tile.wide ? ' guide-tile--wide' : ''
            }`}
            onClick={() => onOpenSection(tile.section)}
          >
            <span className="guide-tile__icon" aria-hidden>
              {tile.icon}
            </span>
            <span className="guide-tile__title">{tile.title}</span>
            <span className="guide-tile__sub">{tile.sub}</span>
          </button>
        ))}
      </nav>

      {/* The dossier's edition marker is NOT shown here. It is edition
          metadata, not trail information: it told a hiker nothing they could
          act on, and it sat alone in the empty space below the grid where it
          drew the eye. The value itself is unchanged and still reported where
          it belongs — Settings → Data sources ("Copy technical details",
          which prints Content version) and trailMetadata.mjs, whose HONESTY
          NOTE explains why a whole-dossier review date deliberately does not
          exist; per-fact verification dates stay on the records themselves. */}
    </div>
  );
}

/**
 * Guide → Shops & supplies: the reference view that lived in Lists, now a
 * dossier section. The copy and the ShopInfoView are unchanged.
 */
export function GuideShopsScreen({
  initialShopType,
}: {
  initialShopType?: ShopCategory;
}) {
  return (
    <div className="screen screen--guide-section">
      <ScreenHeader eyebrow="Trail dossier" title="Shops & supplies" action={<ShopInfoHelp />}>
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
 * personal actions cross into Plan → Travel & stays with the same one-shot
 * launch payloads the Lists screen used to hand over internally.
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
