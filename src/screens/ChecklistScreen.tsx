import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { IconCheck } from '../components/Icons';
import { CHECKLIST } from '../data/checklist';

export function ChecklistScreen() {
  const { state, toggleChecklistItem, checklistPercent, checklistCheckedCount, checklistTotal } =
    useStore();

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Daily rhythm" title="Checklist">
        Reset it each morning. Ticks save automatically and survive a refresh.
      </ScreenHeader>

      <div className="card">
        <div className="row-between">
          <span className="card-title">Today’s progress</span>
          <span className="tnum" style={{ fontWeight: 700 }}>
            {checklistCheckedCount}/{checklistTotal}
          </span>
        </div>
        <div
          style={{
            marginTop: 10,
            height: 8,
            borderRadius: 999,
            background: 'var(--line)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${checklistPercent}%`,
              height: '100%',
              background: 'var(--good)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {CHECKLIST.map((cat) => {
        const done = cat.items.filter((i) => state.checklist[i.id]).length;
        return (
          <div key={cat.id}>
            <div className="section-label row-between">
              <span>{cat.title}</span>
              <span className="tnum">
                {done}/{cat.items.length}
              </span>
            </div>
            <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
              {cat.items.map((item) => {
                const checked = !!state.checklist[item.id];
                return (
                  <button
                    key={item.id}
                    className="check"
                    aria-pressed={checked}
                    onClick={() => toggleChecklistItem(item.id)}
                  >
                    <span className="box">
                      <IconCheck />
                    </span>
                    <span className="label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="card-sub" style={{ marginTop: 18, textAlign: 'center' }}>
        Tip: a fresh day means re-ticking. There’s no auto-reset — that’s
        deliberate, so nothing clears while you sleep.
      </p>
    </div>
  );
}
