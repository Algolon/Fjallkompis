import { useStore, STAGES } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { IconCheck } from '../components/Icons';
import { HUTS_BY_ID } from '../data/huts';
import { formatDistanceKm, formatHours } from '../utils/format';

export function StagesScreen() {
  const { state, currentStage, setCurrentStage } = useStore();

  return (
    <div className="screen">
      <ScreenHeader eyebrow="7 days · 8 huts" title="Stages">
        The route as an ordered sequence. Tap a day to make it your current
        stage.
      </ScreenHeader>

      <div className="stack">
        {STAGES.map((stage) => {
          const from = HUTS_BY_ID[stage.fromHutId];
          const to = HUTS_BY_ID[stage.toHutId];
          const isCurrent = state.currentStageId === stage.id;
          return (
            <div
              className="card"
              key={stage.id}
              style={
                isCurrent
                  ? { borderColor: 'var(--cloudberry)', boxShadow: '0 0 0 1px var(--cloudberry)' }
                  : undefined
              }
            >
              <div className="row-between">
                <span className={`pill ${isCurrent ? 'pill-current' : ''}`}>
                  Day {stage.day}
                </span>
                {isCurrent ? (
                  <span className="pill pill-current">
                    <span className="dot" /> Current
                  </span>
                ) : null}
              </div>

              <h2 className="card-title" style={{ marginTop: 10, fontSize: 18 }}>
                {from.name} → {to.name}
              </h2>

              <div className="row" style={{ gap: 14, marginTop: 8 }}>
                <span className="tnum" style={{ fontWeight: 700 }}>
                  {formatDistanceKm(stage.distanceKm)}
                </span>
                <span className="muted">·</span>
                <span className="tnum muted">{formatHours(stage.estimatedHours)}</span>
              </div>

              <p className="card-sub" style={{ marginTop: 8, lineHeight: 1.5 }}>
                {stage.notes}
              </p>

              <button
                className={`btn btn-block ${isCurrent ? 'btn-ghost' : 'btn-primary'}`}
                style={{ marginTop: 12 }}
                onClick={() => setCurrentStage(stage.id)}
                disabled={isCurrent}
              >
                {isCurrent ? (
                  <>
                    <IconCheck /> This is your current stage
                  </>
                ) : (
                  'Set as current stage'
                )}
              </button>
            </div>
          );
        })}
      </div>

      {!currentStage ? (
        <p className="card-sub" style={{ marginTop: 16, textAlign: 'center' }}>
          Nothing selected yet — pick the day you’re on.
        </p>
      ) : null}
    </div>
  );
}
