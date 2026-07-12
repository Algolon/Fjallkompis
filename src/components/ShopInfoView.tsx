import { useMemo, useState } from 'react';
import { ExternalLink, Info, Search, ShoppingBag, TriangleAlert } from 'lucide-react';
import { ListDisclosure } from './ListDisclosure';
import {
  SHOP_LOCATIONS,
  SHOP_TYPE_INFO,
  SHOP_PRICE_REFERENCE_YEAR,
  SHOP_FACTS_VERIFIED_ON,
  assortmentByCategory,
  assortmentCounts,
  productsForSize,
  STF_LARGE_PRICELIST_URL,
  STF_SMALL_PRICELIST_URL,
  STF_SHOP_OVERVIEW_SOURCE,
} from '../data/shops.mjs';
import { formatVerifiedDate } from '../utils/format';
import type { AssortmentProduct, ProductListing, ShopSize, ShopType } from '../types';

type ShopFilter = 'all' | 'large' | 'small' | 'none';

const FILTERS: { id: ShopFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'large', label: 'Large' },
  { id: 'small', label: 'Small' },
  { id: 'none', label: 'No shop' },
];

/** Class badge — shape + text + (for "No shop") an icon, never colour alone. */
function ShopBadge({ type }: { type: ShopType }) {
  const info = SHOP_TYPE_INFO[type];
  return (
    <span className={`shop-badge shop-badge--${type}`}>
      {type === 'none' ? <TriangleAlert size={12} strokeWidth={2.4} aria-hidden /> : null}
      {info.short}
    </span>
  );
}

/** Resupply reliability line for the collapsed overview row. */
function resupplyHint(type: ShopType): string {
  switch (type) {
    case 'station':
      return 'Full station shop · reliable resupply';
    case 'large':
      return 'Large cabin shop · reliable resupply';
    case 'small':
      return 'Small cabin shop · limited resupply';
    case 'local':
      return 'Local shop · resupply differs from STF cabins';
    case 'none':
      return 'No shop · carry what you need';
  }
}

function AvailabilityTag({ listing }: { listing: ProductListing }) {
  const isStd = listing.availability === 'standard';
  return (
    <span className={`avail-tag ${isStd ? 'avail-standard' : 'avail-extra'}`}>
      {isStd ? 'Standard' : 'Extra*'}
    </span>
  );
}

function ProductRow({ product, size }: { product: AssortmentProduct; size: ShopSize }) {
  const listing = product[size];
  if (!listing) return null;
  return (
    <div className="prod-row">
      <span className="prod-label">
        {product.label}
        {product.note ? <small> · {product.note}</small> : null}
      </span>
      <span className="prod-meta">
        <AvailabilityTag listing={listing} />
        <span className="prod-price tnum">{listing.priceLabel}</span>
      </span>
    </div>
  );
}

export function ShopInfoView() {
  const [filter, setFilter] = useState<ShopFilter>('all');
  const [size, setSize] = useState<ShopSize>('large');
  const [query, setQuery] = useState('');
  const [openLoc, setOpenLoc] = useState<Set<string>>(new Set());
  const [openCat, setOpenCat] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () => ({
      all: SHOP_LOCATIONS.length,
      large: SHOP_LOCATIONS.filter((s) => s.type === 'large').length,
      small: SHOP_LOCATIONS.filter((s) => s.type === 'small').length,
      none: SHOP_LOCATIONS.filter((s) => s.type === 'none').length,
    }),
    [],
  );

  const visibleLocations = useMemo(
    () => (filter === 'all' ? SHOP_LOCATIONS : SHOP_LOCATIONS.filter((s) => s.type === filter)),
    [filter],
  );

  const sizeCounts = assortmentCounts(size);
  const groups = assortmentByCategory(size);

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(
    () => (q ? productsForSize(size).filter((p) => p.label.toLowerCase().includes(q)) : []),
    [q, size],
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  return (
    <>
      <div className="banner-info" role="note">
        <Info size={16} strokeWidth={1.8} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Assortment and prices are planning references. Stock and prices may change.
          Mountain-station and local shops (Abisko, Kebnekaise, Nikkaluokta) carry a
          different range from the STF cabin lists.
        </span>
      </div>

      {/* Small vs Large explanation */}
      <div className="card" style={{ marginTop: 14 }}>
        <span className="card-title">Small vs Large shops</span>
        <p className="card-sub" style={{ marginTop: 8, lineHeight: 1.5 }}>
          STF classes its cabin shops in two sizes. A <strong>Small</strong> shop has a
          limited range, but is meant to hold enough to prepare a complete meal. A{' '}
          <strong>Large</strong> shop offers a wider, broader assortment. Products can still
          be out of stock in either.
        </p>
      </div>

      {/* Route shop overview */}
      <div className="section-label">Route shop overview</div>

      <div
        className="stage-chips"
        role="group"
        aria-label="Filter shops by class"
        style={{ marginBottom: 12 }}
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className="chip"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="tnum" style={{ fontWeight: 500 }}>
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="stack">
        {visibleLocations.map((loc, i) => (
          <ListDisclosure
            key={loc.id}
            id={`shop-${loc.id}`}
            title={loc.name}
            subtitle={<span>{resupplyHint(loc.type)}</span>}
            headerRight={<ShopBadge type={loc.type} />}
            open={openLoc.has(loc.id)}
            onToggle={() => toggle(openLoc, setOpenLoc, loc.id)}
            headingLevel={i === 0 ? 'h2' : 'h3'}
          >
            <p className="stop-desc" style={{ marginTop: 14 }}>
              {loc.description}
            </p>
            <p className="shop-stock-note">
              <Info size={14} strokeWidth={2} aria-hidden /> {loc.stockWarning}
            </p>
            {loc.type === 'large' || loc.type === 'small' ? (
              <p className="card-sub" style={{ marginTop: 8 }}>
                See the full{' '}
                <strong>{loc.type === 'large' ? 'Large' : 'Small'}</strong> assortment under{' '}
                <em>Assortment &amp; prices</em> below.
              </p>
            ) : null}
            <div className="stop-source">
              <p>
                Source: {loc.source.title} · Checked {formatVerifiedDate(loc.source.lastVerified)}
              </p>
              <a
                className="btn btn-ghost btn-block"
                href={loc.source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
                Official information for {loc.name}
              </a>
            </div>
          </ListDisclosure>
        ))}
      </div>

      {/* Assortment & prices */}
      <div className="section-label">Assortment &amp; prices</div>

      <div className="banner-info" role="note">
        <ShoppingBag size={16} strokeWidth={1.8} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Prices are <strong>{SHOP_PRICE_REFERENCE_YEAR} reference prices</strong> (SEK), not
          guaranteed {SHOP_PRICE_REFERENCE_YEAR + 1} prices.
        </span>
      </div>

      {/* Size selector */}
      <div
        className="stage-chips"
        role="group"
        aria-label="Choose Large or Small assortment"
        style={{ marginTop: 12, marginBottom: 10 }}
      >
        {(['large', 'small'] as ShopSize[]).map((s) => (
          <button key={s} className="chip" aria-pressed={size === s} onClick={() => setSize(s)}>
            {s === 'large' ? 'Large assortment' : 'Small assortment'}
            <span className="tnum" style={{ fontWeight: 500 }}>
              {assortmentCounts(s).total}
            </span>
          </button>
        ))}
      </div>

      {/* Legend — Standard vs Extra (text + shape, not colour alone) */}
      <div className="avail-legend" aria-hidden={false}>
        <span className="avail-legend-item">
          <span className="avail-tag avail-standard">Standard</span> in stock all season
        </span>
        <span className="avail-legend-item">
          <span className="avail-tag avail-extra">Extra*</span> while stocks last
        </span>
      </div>
      <p className="card-sub" style={{ margin: '6px 2px 0' }}>
        {sizeCounts.standard} standard · {sizeCounts.extra} extra items in the{' '}
        {size === 'large' ? 'Large' : 'Small'} list.
      </p>

      {/* Product search */}
      <label className="field" style={{ marginTop: 12 }}>
        <span className="sr-only">Search products</span>
        <span className="prod-search">
          <Search size={16} strokeWidth={1.9} aria-hidden />
          <input
            className="input"
            type="search"
            inputMode="search"
            placeholder={`Search the ${size === 'large' ? 'Large' : 'Small'} assortment…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Search the ${size === 'large' ? 'Large' : 'Small'} assortment`}
          />
        </span>
      </label>

      {q ? (
        <div className="card" style={{ marginTop: 12, paddingTop: 8, paddingBottom: 8 }}>
          {searchResults.length === 0 ? (
            <p className="empty" style={{ padding: '16px 8px' }}>
              No {size === 'large' ? 'Large' : 'Small'}-shop product matches “{query}”.
            </p>
          ) : (
            searchResults.map((p) => <ProductRow key={p.id} product={p} size={size} />)
          )}
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {groups.map((group) => (
            <ListDisclosure
              key={`${size}-${group.category.id}`}
              id={`cat-${size}-${group.category.id}`}
              title={group.category.title}
              subtitle={
                <span className="tnum">
                  {group.products.length} item{group.products.length === 1 ? '' : 's'}
                </span>
              }
              open={openCat.has(`${size}-${group.category.id}`)}
              onToggle={() => toggle(openCat, setOpenCat, `${size}-${group.category.id}`)}
            >
              <div className="prod-list">
                {group.products.map((p) => (
                  <ProductRow key={p.id} product={p} size={size} />
                ))}
              </div>
            </ListDisclosure>
          ))}
        </div>
      )}

      {/* Source & validity */}
      <div className="section-label">Source &amp; validity</div>
      <div className="card">
        <p className="card-sub" style={{ lineHeight: 1.55 }}>
          Assortments and prices are transcribed from STF's official{' '}
          {SHOP_PRICE_REFERENCE_YEAR} shop price lists and are used as planning references
          only. Classification checked {formatVerifiedDate(SHOP_FACTS_VERIFIED_ON)}.
        </p>
        <a
          className="btn btn-ghost btn-block"
          style={{ marginTop: 10 }}
          href={STF_SHOP_OVERVIEW_SOURCE.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
          STF mountain shops overview
        </a>
        <a
          className="btn btn-ghost btn-block"
          style={{ marginTop: 8 }}
          href={STF_LARGE_PRICELIST_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
          Large shop price list ({SHOP_PRICE_REFERENCE_YEAR}, PDF)
        </a>
        <a
          className="btn btn-ghost btn-block"
          style={{ marginTop: 8 }}
          href={STF_SMALL_PRICELIST_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
          Small shop price list ({SHOP_PRICE_REFERENCE_YEAR}, PDF)
        </a>
      </div>
    </>
  );
}
