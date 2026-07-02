import { useStore, effectiveShop } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { HUTS } from '../data/huts';
import { hutTypeLabel, shopLabel } from '../utils/format';
import type { ShopStatus } from '../types';

const SHOP_OPTIONS: { value: ShopStatus; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
];

export function HutsScreen() {
  const { getHutData, setHutNotes, setHutShopOverride } = useStore();

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Along the way" title="Huts">
        Eight places, north to south. Add your own notes — they save instantly.
      </ScreenHeader>

      <div className="stack">
        {HUTS.map((hut) => {
          const data = getHutData(hut.id);
          const shop = effectiveShop(hut.id, data);
          return (
            <div className="card" key={hut.id}>
              <div className="row-between">
                <h2 className="card-title">{hut.name}</h2>
                <span className="pill">{hutTypeLabel(hut.type)}</span>
              </div>

              <p className="card-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
                {hut.blurb}
              </p>

              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <span
                  className={`pill ${
                    shop === 'yes' ? 'pill-good' : shop === 'no' ? 'pill-warn' : ''
                  }`}
                >
                  {shopLabel(shop)}
                </span>
                {data.shopOverride ? (
                  <button
                    className="link-btn"
                    onClick={() => setHutShopOverride(hut.id, undefined)}
                  >
                    Reset to default ({shopLabel(hut.shop)})
                  </button>
                ) : null}
              </div>

              <label className="field">
                <span>Shop available?</span>
                <div className="score-row">
                  {SHOP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className="score-dot"
                      aria-pressed={shop === opt.value}
                      onClick={() => setHutShopOverride(hut.id, opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Personal notes</span>
                <textarea
                  className="textarea"
                  placeholder="Bunk number, water source, who you met, what to remember next time…"
                  value={data.notes}
                  onChange={(e) => setHutNotes(hut.id, e.target.value)}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
