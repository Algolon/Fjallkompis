import { useEffect, useMemo, useState } from 'react';
import {
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  RefreshCw,
  Sun,
  WifiOff,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { ContextHelp } from '../components/ContextHelp';
import {
  HUT_TO_WAYPOINT,
  WAYPOINT_BY_ID,
  stopShortName,
} from '../trail/activeTrailContent';
import {
  availableDates,
  conditionForCode,
  dateChipLabel,
  formatPrecip,
  formatTempRange,
  formatWind,
  freshnessLevel,
  freshnessNotice,
  shortDateLabel,
  stockholmDateOf,
  summarizeDayParts,
  summarizeLocationDay,
} from '../weather/weatherModel.mjs';
import type {
  WeatherLocationForecast,
  WeatherSnapshot,
} from '../weather/weatherModel.mjs';
import {
  readWeatherSnapshot,
  replaceWeatherSnapshot,
  weatherStorageSupported,
} from '../weather/weatherStore.mjs';
import { fetchSmhiRouteSnapshot } from '../weather/smhiProvider.mjs';
import type { WeatherProviderLocation } from '../weather/smhiProvider.mjs';
import { dateForDayIndex } from '../plan/dayPlan.mjs';

/**
 * Guide → Weather — the saved route forecast (prototype; design note in
 * docs/proposals/weather-section.md).
 *
 * Date-first: one compact date strip selects a Swedish calendar day, the
 * eight named route locations below re-render for it in walking order (the
 * SAME verified stops the whole app uses — never separate weather
 * coordinates). The screen owns its data status: the strip at the top
 * always answers "when was this saved and how far does it reach", offline
 * or not. The one action is a deliberate, manual "Update forecast" —
 * fetch, validate, then atomically replace; a failed update NEVER touches
 * the saved snapshot.
 */

/** Condition icon per group (local Lucide set — no remote weather assets). */
function ConditionIcon({ code, size = 22 }: { code: number | null; size?: number }) {
  const condition = conditionForCode(code);
  const p = { size, strokeWidth: 1.9, 'aria-hidden': true as const };
  if (!condition) return <Cloudy {...p} />;
  switch (condition.group) {
    case 'clear':
      return <Sun {...p} />;
    case 'partly-cloudy':
      return <CloudSun {...p} />;
    case 'cloudy':
      return <Cloudy {...p} />;
    case 'fog':
      return <CloudFog {...p} />;
    case 'rain-showers':
      return <CloudDrizzle {...p} />;
    case 'rain':
      return <CloudRain {...p} />;
    case 'sleet':
      return <CloudHail {...p} />;
    case 'snow':
      return <CloudSnow {...p} />;
    case 'thunder':
      return <CloudLightning {...p} />;
  }
}

function WeatherHelp() {
  return (
    <ContextHelp label="About the saved forecast" title="About the saved forecast">
      <p>
        Weather shows point forecasts for the named stops along the route,
        saved on this device so they stay readable without coverage. Update
        the forecast while you still have a connection — typically before
        leaving Abisko or Nikkaluokta.
      </p>
      <p>
        Each entry is the forecast for that forecast location, not for a
        whole stage. Mountain weather can vary quickly between forecast
        locations and with elevation.
      </p>
      <p>
        Forecasts come from SMHI (Swedish Meteorological and Hydrological
        Institute) open data and reach about ten days ahead; the app never
        extends them beyond what SMHI published.
      </p>
    </ContextHelp>
  );
}

/** Device connectivity as copy guidance (the fetch itself is the truth). */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

type UpdatePhase =
  | { kind: 'idle' }
  | { kind: 'updating' }
  | { kind: 'updated'; savedLocations: number }
  | { kind: 'failed'; hadSnapshot: boolean };

export function GuideWeatherScreen() {
  const { itinerary, state } = useStore();
  const online = useOnline();

  // null = nothing saved; undefined = still reading storage.
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null | undefined>(
    undefined,
  );
  const [phase, setPhase] = useState<UpdatePhase>({ kind: 'idle' });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readWeatherSnapshot().then((saved) => {
      if (!cancelled) setSnapshot(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The weather locations ARE the verified route stops, in walking order
  // for the active direction. Elevation rides along from the same GPX
  // waypoints; nothing is duplicated or hand-entered here.
  const locations = useMemo<WeatherProviderLocation[]>(
    () =>
      itinerary.orderedStops.map((stop) => ({
        id: stop.id,
        name: stopShortName(stop),
        lat: stop.coord.lat,
        lon: stop.coord.lng,
        elevationM: WAYPOINT_BY_ID[HUT_TO_WAYPOINT[stop.id]]?.elevation ?? null,
      })),
    [itinerary],
  );

  const nowIso = new Date().toISOString();
  const todayIso = stockholmDateOf(nowIso);
  const dates = useMemo(
    () => (snapshot ? availableDates(snapshot) : []),
    [snapshot],
  );
  // Sticky selection with an honest fallback: today when covered, else the
  // first saved date. Dates before today are not offered — they are history.
  const futureDates = useMemo(
    () => dates.filter((d) => todayIso === null || d >= todayIso),
    [dates, todayIso],
  );
  const activeDate =
    selectedDate && futureDates.includes(selectedDate)
      ? selectedDate
      : todayIso && futureDates.includes(todayIso)
        ? todayIso
        : futureDates[0] ?? null;

  // Subtle trip context: dates covered by the personal Day plan get a quiet
  // marker. Weather never depends on a plan existing.
  const tripDates = useMemo(() => {
    const plan = state.dayPlan;
    if (!plan) return new Set<string>();
    const set = new Set<string>();
    for (let i = 0; i < plan.days.length; i++) {
      const d = dateForDayIndex(plan.startDate, i);
      if (d) set.add(d);
    }
    return set;
  }, [state.dayPlan]);

  const snapshotById = useMemo(() => {
    const map = new Map<string, WeatherLocationForecast>();
    for (const loc of snapshot?.locations ?? []) map.set(loc.id, loc);
    return map;
  }, [snapshot]);

  const doUpdate = async () => {
    setPhase({ kind: 'updating' });
    try {
      const next = await fetchSmhiRouteSnapshot(locations);
      await replaceWeatherSnapshot(next);
      setSnapshot(next);
      setPhase({ kind: 'updated', savedLocations: next.locations.length });
    } catch (err) {
      console.warn('Fjallkompis: the forecast update failed.', err);
      setPhase({ kind: 'failed', hadSnapshot: snapshot != null });
    }
  };

  const updating = phase.kind === 'updating';
  const notice = snapshot ? freshnessNotice(snapshot.downloadedAt, nowIso) : null;
  const level = snapshot ? freshnessLevel(snapshot.downloadedAt, nowIso) : 'fresh';
  // Fixed 24-hour English, matching the app's HH:mm convention everywhere
  // else (dateTimeField.mjs) — never the device locale's 12-hour clock.
  const savedTime = snapshot
    ? new Date(snapshot.downloadedAt).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="screen screen--guide-section weather-screen">
      <ScreenHeader eyebrow="Trail dossier" title="Weather" action={<WeatherHelp />}>
        Forecast locations along the route — saved on this device so you can
        check them without coverage.
      </ScreenHeader>

      {/* Data status — the screen's own, always-visible answer to "how old
          is this and how far does it reach". Compact by design: one card,
          no hero. */}
      <section className="card weather-status" aria-label="Saved forecast status">
        {snapshot ? (
          <>
            <div className="weather-status__row">
              <span className="weather-status__title">Saved trail forecast</span>
              {online ? (
                notice === null ? (
                  <span className="pill pill-good">Available offline</span>
                ) : null
              ) : (
                <span className="pill pill-glacier">
                  <WifiOff size={12} strokeWidth={2.2} aria-hidden /> Offline
                </span>
              )}
            </div>
            <p className="weather-status__meta">
              Updated {notice === null ? 'today' : shortDateLabel(stockholmDateOf(snapshot.downloadedAt))}{' '}
              {savedTime} · Forecast through{' '}
              {shortDateLabel(stockholmDateOf(snapshot.validThrough))}
            </p>
            {notice ? (
              <p
                className={`weather-status__notice${
                  level === 'stale' ? ' weather-status__notice--stale' : ''
                }`}
              >
                {notice}
                {!online ? ' · saved on this device' : ''}
              </p>
            ) : null}
          </>
        ) : snapshot === null ? (
          <>
            <div className="weather-status__row">
              <span className="weather-status__title">
                {online ? 'No forecast saved yet' : 'No offline forecast saved'}
              </span>
              {!online ? (
                <span className="pill pill-glacier">
                  <WifiOff size={12} strokeWidth={2.2} aria-hidden /> Offline
                </span>
              ) : null}
            </div>
            <p className="weather-status__meta">
              {online
                ? 'Update once while online to keep the route forecast on this device.'
                : 'Connect once before the trail to save the route forecast for offline use.'}
            </p>
            {!weatherStorageSupported() ? (
              <p className="weather-status__notice weather-status__notice--stale">
                This browser mode cannot store data — the forecast will not
                survive a restart.
              </p>
            ) : null}
          </>
        ) : (
          <p className="weather-status__meta">Loading saved forecast…</p>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block weather-update"
          onClick={() => void doUpdate()}
          disabled={updating || snapshot === undefined}
        >
          <RefreshCw
            size={16}
            strokeWidth={2.1}
            aria-hidden
            className={updating ? 'weather-update__spin' : undefined}
          />
          {updating ? 'Updating forecast…' : 'Update forecast'}
        </button>

        {phase.kind === 'updated' ? (
          <p className="weather-status__result" role="status">
            Forecast updated · {phase.savedLocations} route locations saved
          </p>
        ) : null}
        {phase.kind === 'failed' ? (
          <div className="banner-warn weather-status__failed" role="status">
            <span aria-hidden>⚠️</span>
            <span>
              Couldn&apos;t update the forecast.{' '}
              {phase.hadSnapshot
                ? 'Your previously saved forecast is still available below.'
                : online
                  ? 'Check your connection and try again.'
                  : 'You appear to be offline — try again with a connection.'}
            </span>
          </div>
        ) : null}
      </section>

      {snapshot ? (
        <>
          {/* Date strip — the day under comparison. Selecting a date
              re-renders the whole location list; locations are never picked
              first. */}
          <nav className="weather-dates" aria-label="Forecast dates">
            {futureDates.map((date) => (
              <button
                key={date}
                type="button"
                className="chip weather-date-chip"
                aria-pressed={date === activeDate}
                onClick={() => setSelectedDate(date)}
              >
                {dateChipLabel(date, todayIso ?? '')}
                {tripDates.has(date) ? (
                  <span className="weather-date-chip__trip" aria-label="Trip day" />
                ) : null}
              </button>
            ))}
          </nav>

          {activeDate ? (
            <ul className="weather-list" aria-label="Forecast by location">
              {locations.map((location) => {
                const forecast = snapshotById.get(location.id) ?? null;
                const summary = forecast
                  ? summarizeLocationDay(forecast, activeDate)
                  : null;
                const expanded = expandedId === location.id && summary !== null;
                const precip = formatPrecip(summary);
                const wind = summary
                  ? formatWind(summary.maxWindMs, summary.maxGustMs)
                  : null;
                return (
                  <li key={location.id} className="card weather-row">
                    <button
                      type="button"
                      className="weather-row__head"
                      aria-expanded={summary ? expanded : undefined}
                      disabled={!summary}
                      onClick={() =>
                        setExpandedId((cur) =>
                          cur === location.id ? null : location.id,
                        )
                      }
                    >
                      <span className="weather-row__icon" aria-hidden>
                        <ConditionIcon
                          code={summary?.dominantCondition ?? null}
                        />
                      </span>
                      <span className="weather-row__body">
                        <span className="weather-row__name">
                          {location.name}
                          {location.elevationM !== null ? (
                            <span className="weather-row__elev">
                              {Math.round(location.elevationM)} m
                            </span>
                          ) : null}
                        </span>
                        {summary ? (
                          <span className="weather-row__metrics">
                            <span className="weather-row__temp tnum">
                              {formatTempRange(summary.minTempC, summary.maxTempC)}
                            </span>
                            {precip ? (
                              <span className="weather-row__fact tnum">{precip}</span>
                            ) : (
                              <span className="weather-row__fact weather-row__fact--dry">
                                Dry
                              </span>
                            )}
                            {wind ? (
                              <span className="weather-row__fact tnum">{wind}</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="weather-row__missing">
                            No saved forecast for this date
                          </span>
                        )}
                      </span>
                    </button>
                    {expanded && forecast ? (
                      <div className="weather-row__detail">
                        {summarizeDayParts(forecast, activeDate).map((part) => (
                          <div key={part.id} className="weather-part">
                            <span className="weather-part__label">{part.label}</span>
                            {part.data ? (
                              <span className="weather-part__facts tnum">
                                <ConditionIcon
                                  code={part.data.conditionCode}
                                  size={16}
                                />
                                {formatTempRange(
                                  part.data.tempMinC,
                                  part.data.tempMaxC,
                                )}
                                {part.data.totalPrecipMm !== null &&
                                part.data.totalPrecipMm >= 0.1
                                  ? ` · ${part.data.totalPrecipMm} mm`
                                  : ''}
                                {part.data.maxWindMs !== null
                                  ? ` · ${Math.round(part.data.maxWindMs)} m/s`
                                  : ''}
                              </span>
                            ) : (
                              <span className="weather-part__facts">—</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="card weather-empty-date">
              <p className="weather-status__meta">
                No saved forecast for today or later — the saved forecast has
                aged past its final date. Update closer to your trip.
              </p>
            </div>
          )}
        </>
      ) : null}

      <p className="weather-footnote">
        Point forecasts for the marked places, not whole stages. Mountain
        weather can vary quickly between forecast locations and with
        elevation.
        {snapshot ? (
          <>
            {' '}
            Forecast data:{' '}
            <a href="https://www.smhi.se" target="_blank" rel="noreferrer">
              SMHI
            </a>{' '}
            open data.
          </>
        ) : null}
      </p>
    </div>
  );
}
