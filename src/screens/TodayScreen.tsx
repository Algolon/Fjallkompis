import { useStore } from '../store/AppStore';
import { ScreenHeader, ProgressRing, OnlineBadge } from '../components/ui';
import { HUTS_BY_ID } from '../data/huts';
import { formatDistanceKm, formatHours, formatDateLong } from '../utils/format';
import type { TabId } from '../components/TabBar';

export function TodayScreen({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  const {
    currentStage,
    checklistPercent,
    checklistCheckedCount,
    checklistTotal,
    latestJournalEntry,
  } = useStore();

  const from = currentStage ? HUTS_BY_ID[currentStage.fromHutId] : null;
  const to = currentStage ? HUTS_BY_ID[currentStage.toHutId] : null;

  return (
    <div className="screen">
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="eyebrow" style={{ color: 'var(--glacier)' }}>
          Kungsleden
        </span>
        <OnlineBadge />
      </div>

      <ScreenHeader eyebrow="" title="Today">
        Your day at a glance. Everything here works offline.
      </ScreenHeader>

      {currentStage && from && to ? (
        <>
          <div className="card">
            <div className="row-between">
              <span className="pill pill-current">
                Day {currentStage.day} · current stage
              </span>
            </div>
            <h2 className="card-title" style={{ marginTop: 10, fontSize: 20 }}>
              {from.name} → {to.name}
            </h2>
            <p className="card-sub" style={{ marginTop: 6 }}>
              {currentStage.notes}
            </p>

            <div className="stat-grid" style={{ marginTop: 14 }}>
              <div className="stat">
                <div className="k">Distance</div>
                <div className="v tnum">{formatDistanceKm(currentStage.distanceKm)}</div>
              </div>
              <div className="stat">
                <div className="k">Est. time</div>
                <div className="v tnum">{formatHours(currentStage.estimatedHours)}</div>
              </div>
              <div className="stat">
                <div className="k">Next hut</div>
                <div className="v" style={{ fontSize: 18 }}>
                  {to.name}
                </div>
              </div>
              <div className="stat">
                <div className="k">Hut type</div>
                <div className="v" style={{ fontSize: 18 }}>
                  {to.type === 'mountain-station'
                    ? 'Station'
                    : to.type === 'village'
                      ? 'Village'
                      : 'Hut'}
                </div>
              </div>
            </div>

            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              onClick={() => onNavigate('map')}
            >
              Open route map
            </button>
          </div>

          <div className="card">
            <div className="ring-wrap">
              <ProgressRing percent={checklistPercent} />
              <div style={{ flex: 1 }}>
                <div className="row-between">
                  <span className="card-title">Checklist</span>
                  <span className="ring-num tnum">{checklistPercent}%</span>
                </div>
                <p className="card-sub" style={{ marginTop: 2 }}>
                  {checklistCheckedCount} of {checklistTotal} done
                </p>
              </div>
            </div>
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              onClick={() => onNavigate('checklist')}
            >
              Open checklist
            </button>
          </div>

          <div className="card">
            <span className="card-title">Latest journal</span>
            {latestJournalEntry ? (
              <>
                <p className="card-sub" style={{ marginTop: 6 }}>
                  {formatDateLong(latestJournalEntry.date)} · mood{' '}
                  {latestJournalEntry.mood}/5 · energy {latestJournalEntry.energy}/5
                </p>
                <p style={{ marginTop: 8, lineHeight: 1.5 }}>
                  {latestJournalEntry.highlight?.trim()
                    ? latestJournalEntry.highlight
                    : latestJournalEntry.reflection?.trim()
                      ? latestJournalEntry.reflection
                      : 'No highlight written yet.'}
                </p>
              </>
            ) : (
              <p className="card-sub" style={{ marginTop: 6 }}>
                No entries yet. Tonight, jot down one good moment and one hard one.
              </p>
            )}
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              onClick={() => onNavigate('journal')}
            >
              {latestJournalEntry ? 'Open journal' : 'Write first entry'}
            </button>
          </div>
        </>
      ) : (
        <div className="card empty">
          <div className="glyph">⛰️</div>
          <p>
            No current stage selected. Head to Stages and tap “Set as current” to
            light up your day.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => onNavigate('stages')}
          >
            Choose a stage
          </button>
        </div>
      )}
    </div>
  );
}
