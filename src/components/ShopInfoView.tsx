import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Info, Search } from 'lucide-react';
import { ListDisclosure } from './ListDisclosure';
import { ContextHelp } from './ContextHelp';
import {
  VISIBLE_SHOP_CATEGORIES,
  SHOP_PRICE_REFERENCE_YEAR,
  SHOP_FACTS_VERIFIED_ON,
  FULL_SERVICE_SHOPS,
  assortmentByCategory,
  assortmentCounts,
  productsForSize,
  STF_LARGE_PRICELIST_URL,
  STF_SMALL_PRICELIST_URL,
  STF_SHOP_OVERVIEW_SOURCE,
} from '../data/shops.mjs';
import { formatVerifiedDate } from '../utils/format';
import type { AssortmentProduct, ProductListing, ShopCategory, ShopSize } from '../types';

/** Short explanation of each STF cabin-shop size. */
const SIZE_EXPLANATION: Record<ShopSize, string> = {
  large:
    'The Large classification is an STF cabin shop with a wider, broader product range.',
  small:
    'A Small shop is an STF cabin shop with a limited range — intended to hold enough to prepare a complete meal.',
};

/**
 * Page-level "About shop information" help — explains the three shop-type
 * categories. Rendered in the Lists header's action slot when Shops is active.
 * Shops is about shop TYPES; Stops owns which route location has a shop.
 */
export function ShopInfoHelp() {
  return (
    <ContextHelp label="About shop information" title="About shop information">
      <p>
        Compare the shop types relevant to this route. Which route locations have a shop is
        shown on the Stops screen.
      </p>
      <h3>Large shop</h3>
      <p>An STF cabin shop with a wider, broader assortment.</p>
      <h3>Small shop</h3>
      <p>
        An STF cabin shop with a limited range, intended to hold enough to prepare a complete
        meal.
      </p>
      <h3>Full-service shops</h3>
      <p>
        Larger, broader shops (Abisko, Kebnekaise, Nikkaluokta) that do not use the STF cabin
        Small/Large assortment lists — check range and prices with each facility.
      </p>
      <p>Products can be out of stock in any shop. Assortments and prices are planning references.</p>
    </ContextHelp>
  );
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

/** The STF cabin-shop assortment (Large or Small): catalogue, search, prices. */
function AssortmentPanel({ size }: { size: ShopSize }) {
  const [query, setQuery] = useState('');
  const [openCat, setOpenCat] = useState<Set<string>>(new Set());

  const sizeLabel = size === 'large' ? 'Large' : 'Small';
  const sizeCounts = assortmentCounts(size);
  const groups = assortmentByCategory(size);
  const q = query.trim().toLowerCase();
  const searchResults = useMemo(
    () => (q ? productsForSize(size).filter((p) => p.label.toLowerCase().includes(q)) : []),
    [q, size],
  );

  const toggleCat = (id: string) => {
    setOpenCat((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <p className="card-sub" style={{ margin: '0 2px 14px', lineHeight: 1.5 }}>
        {SIZE_EXPLANATION[size]}
      </p>

      <div className="section-label section-label--action">
        <span>Assortment &amp; prices</span>
        <ContextHelp
          variant="inline"
          label="About assortment prices"
          title={`${SHOP_PRICE_REFERENCE_YEAR} reference prices`}
        >
          <p>
            Prices are <strong>{SHOP_PRICE_REFERENCE_YEAR} reference prices</strong> (SEK), not
            guaranteed {SHOP_PRICE_REFERENCE_YEAR + 1} prices.
          </p>
        </ContextHelp>
      </div>

      {/* Legend — Standard vs Extra (text + shape, not colour alone) */}
      <div className="avail-legend">
        <span className="avail-legend-item">
          <span className="avail-tag avail-standard">Standard</span> in stock all season
        </span>
        <span className="avail-legend-item">
          <span className="avail-tag avail-extra">Extra*</span> while stocks last
        </span>
      </div>
      <p className="card-sub" style={{ margin: '6px 2px 0' }}>
        {sizeCounts.standard} standard · {sizeCounts.extra} extra items in the {sizeLabel} list.
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
            placeholder={`Search the ${sizeLabel} shop…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Search the ${sizeLabel} shop`}
          />
        </span>
      </label>

      {q ? (
        <div className="card" style={{ marginTop: 12, paddingTop: 8, paddingBottom: 8 }}>
          {searchResults.length === 0 ? (
            <p className="empty" style={{ padding: '16px 8px' }}>
              No {sizeLabel} shop product matches “{query}”.
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
              onToggle={() => toggleCat(`${size}-${group.category.id}`)}
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
          The {sizeLabel} assortment and prices are transcribed from STF's official{' '}
          {SHOP_PRICE_REFERENCE_YEAR} shop price list and are planning references only. Checked{' '}
          {formatVerifiedDate(SHOP_FACTS_VERIFIED_ON)}.
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
          href={size === 'large' ? STF_LARGE_PRICELIST_URL : STF_SMALL_PRICELIST_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
          {sizeLabel} shop price list ({SHOP_PRICE_REFERENCE_YEAR}, PDF)
        </a>
      </div>
    </>
  );
}

/**
 * Full-service shops: supporting information about the shop TYPE — not a second
 * Stops overview. No product catalogue, Standard/Extra counts or price controls,
 * because Fjällkompis has no reliable item-by-item list for these shops.
 */
function FullServicePanel() {
  return (
    <>
      <div className="banner-info" role="note">
        <Info size={16} strokeWidth={1.8} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          These locations provide broader services and shops than the standard STF cabin-shop
          model. Their shops do not use the STF Small/Large assortment lists and likely carry a
          broader, more locally determined range. Fjällkompis has no reliable inventory or price
          list for them — check range, availability and prices with each facility. Do not assume
          every product in a Large cabin shop is stocked here.
        </span>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {FULL_SERVICE_SHOPS.map((shop) => (
          <div key={shop.id} className="card full-service-card">
            <span className="card-title">{shop.name}</span>
            <p className="card-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
              {shop.note}
            </p>
            <a
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              href={shop.source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
              Official information for {shop.name}
            </a>
          </div>
        ))}
      </div>

      <p className="card-sub" style={{ margin: '14px 2px 0', lineHeight: 1.5 }}>
        This is a combined category for the current Abisko–Nikkaluokta scope; it does not claim
        these facilities share one formal STF classification.
      </p>
    </>
  );
}

export function ShopInfoView({ initialShopType }: { initialShopType?: ShopCategory } = {}) {
  // Only visible categories are selectable; a deep link to a hidden one falls
  // back to the default (no current route stop maps to Small anyway).
  const validInitial =
    initialShopType && VISIBLE_SHOP_CATEGORIES.some((c) => c.id === initialShopType)
      ? initialShopType
      : undefined;
  const [category, setCategory] = useState<ShopCategory>(validInitial ?? 'large');

  // One-shot deep link: move focus to the selected shop-type control so the
  // destination is announced and keyboard navigation continues from there.
  useEffect(() => {
    if (!validInitial) return;
    const el = document.getElementById(`shop-type-${validInitial}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
    el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Shop-type selector — the main navigation within Shops. */}
      <div
        className="stage-chips"
        role="group"
        aria-label="Choose a shop type"
        style={{ marginBottom: 14 }}
      >
        {VISIBLE_SHOP_CATEGORIES.map((c) => (
          <button
            key={c.id}
            id={`shop-type-${c.id}`}
            className="chip"
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {category === 'full-service' ? (
        <FullServicePanel />
      ) : (
        <AssortmentPanel size={category} />
      )}
    </>
  );
}
