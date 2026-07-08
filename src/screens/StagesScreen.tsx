import { useStore, STAGES } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { IconCheck } from '../components/Icons';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { formatDistanceKm, formatHoursEstimate } from '../utils/format';
import { ROUTE } from '../route/routeData';

export function StagesScreen() {
  const { state, currentStage, setCurrentStage } = useStore();

  return (
    <div className="screen screen--stages">
      <ScreenHeader eyebrow="7 days · 8 stops" title="Stages">
        The route as an ordered sequence. Tap a day to make it your current
        stage. Distances and climbing come from the GPX; ± times are personal
        estimates.
      </ScreenHeader>

      <div className="card" style={{ marginBottom: 14 }}>
        <span className="card-title">{ROUTE.name}</span>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span className="pill tnum">{formatDistanceKm(ROUTE.statistics.distanceKm)} total</span>
          <span className="pill tnum">↗ {ROUTE.statistics.totalAscentM} m</span>
          <span className="pill tnum">↘ {ROUTE.statistics.totalDescentM} m</span>
          <span className="pill tnum">
            {Math.round(ROUTE.statistics.minimumElevationM ?? 0)}–
            {Math.round(ROUTE.statistics.maximumElevationM ?? 0)} m
          </span>
        </div>
      </div>

      <div className="stack">
        {STAGES.map((stage) => {
          const from = STOPS_BY_ID[stage.fromHutId];
          const to = STOPS_BY_ID[stage.toHutId];
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
                <div className="row" style={{ gap: 10 }}>
                  <span className={`pill ${isCurrent ? 'pill-current' : ''}`}>
                    Day {stage.day}
                  </span>
                  <span className="tnum" style={{ fontWeight: 700 }}>
                    {formatDistanceKm(stage.distanceKm)}
                  </span>
                </div>
                {isCurrent ? (
                  <span className="pill pill-current">
                    <span className="dot" /> Current
                  </span>
                ) : null}
              </div>

              <h2 className="card-title" style={{ marginTop: 10, fontSize: 18 }}>
                {stopShortName(from)} → {stopShortName(to)}
              </h2>

              <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span className="pill tnum">↗ {stage.totalAscentM ?? '—'} m</span>
                <span className="pill tnum">↘ {stage.totalDescentM ?? '—'} m</span>
                <span className="pill tnum">
                  {stage.minimumElevationM != null
                    ? `${Math.round(stage.minimumElevationM)}–${Math.round(stage.maximumElevationM ?? 0)} m`
                    : '—'}
                </span>
                <span className="pill tnum" title="Estimated walking time">
                  {formatHoursEstimate(stage.estimatedHours)}
                </span>
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
