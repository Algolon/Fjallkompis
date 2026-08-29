import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
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
 * coordinates). The forecast itself is the protagonist: sync status is one
 * compact line near the top that always answers "when was this saved and
 * how far does it reach", offline or not, and the strip stays sticky while
 * scrolling the list. The one action is a deliberate, manual update —
 * fetch, validate, then atomically replace; a failed update NEVER touches
 * the saved snapshot. It renders as a compact secondary action while a
 * saved forecast exists (primary fill once stale), and only grows to a
 * full-width primary CTA when nothing is saved yet.
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
  const datesRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readWeatherSnapshot().then((saved) => {
      if (!cancelled) setSnapshot(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The post-update confirmation is transient by design: the refreshed
  // "Saved today HH:mm" line IS the durable status, so the check clears
  // itself instead of a success sentence lingering forever.
  useEffect(() => {
    if (phase.kind !== 'updated') return;
    const t = window.setTimeout(() => setPhase({ kind: 'idle' }), 4000);
    return () => window.clearTimeout(t);
  }, [phase]);


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

  // Keep the selected day's chip visible in the (sticky, horizontally
  // scrolling) strip — the fallback selection can land mid-list when the
  // previously chosen date ages out of the saved range. Runs only when the
  // active day changes, never on unrelated re-renders, so a manually
  // scrolled strip is left alone.
  useEffect(() => {
    const chip = datesRef.current?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    chip?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeDate]);

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
        Route forecasts, saved for offline use.
      </ScreenHeader>

      {/* Sync status — one compact card, not a hero: title + compact Update
          in a single row, one meta line beneath. Updating is an occasional
          management action; the forecast below is the primary content.
          "Saved", not "Updated", in copy: the timestamp is downloadedAt —
          when THIS DEVICE saved the snapshot — never SMHI's issue time. */}
      <section className="card weather-sync" aria-label="Saved forecast status">
        {snapshot ? (
          <>
            <div className="weather-sync__row">
              <span className="weather-sync__title">Offline forecast</span>
              <button
                type="button"
                className={`btn weather-sync__btn${
                  level === 'stale' ? ' btn-primary' : ''
                }`}
                onClick={() => void doUpdate()}
                disabled={updating || !online}
              >
                {phase.kind === 'updated' ? (
                  <Check
                    size={16}
                    strokeWidth={2.4}
                    aria-hidden
                    className="weather-sync__done"
                  />
                ) : (
                  <RefreshCw
                    size={15}
                    strokeWidth={2.1}
                    aria-hidden
                    className={updating ? 'weather-sync__spin' : undefined}
                  />
                )}
                {updating
                  ? 'Updating…'
                  : phase.kind === 'updated'
                    ? 'Updated'
                    : 'Update'}
              </button>
            </div>
            {/* One line carries the whole story — age (model wording, never
                ad hoc), coverage, and the tertiary location count — so age
                is never stated twice. The clock time rides along while it
                still means something (today/yesterday). */}
            <p className="weather-sync__meta">
              <span
                className={
                  level === 'stale' ? 'weather-sync__notice--stale' : undefined
                }
              >
                {notice === null
                  ? `Saved today ${savedTime}`
                  : level === 'aging'
                    ? `${notice} ${savedTime}`
                    : notice}
              </span>
              {' · through '}
              {shortDateLabel(stockholmDateOf(snapshot.validThrough))}
              <span className="weather-sync__count">
                {' '}
                · {snapshot.locations.length} locations
              </span>
            </p>
            {!online ? (
              <p className="weather-sync__offline">
                <WifiOff size={13} strokeWidth={2.2} aria-hidden />
                No connection — the saved forecast still works.
              </p>
            ) : null}
          </>
        ) : snapshot === null ? (
          <>
            <div className="weather-sync__row">
              <span className="weather-sync__title">
                {online ? 'No forecast saved yet' : 'No offline forecast saved'}
              </span>
              {!online ? (
                <span className="pill pill-glacier">
                  <WifiOff size={12} strokeWidth={2.2} aria-hidden /> Offline
                </span>
              ) : null}
            </div>
            <p className="weather-sync__meta">
              {online
                ? 'Download once while online to keep the route forecast on this device.'
                : 'Connect once before the trail to save the route forecast for offline use.'}
            </p>
            {!weatherStorageSupported() ? (
              <p className="weather-sync__notice weather-sync__notice--stale">
                This browser mode cannot store data — the forecast will not
                survive a restart.
              </p>
            ) : null}
            {/* State E is the one place a full-width primary CTA is right:
                there is nothing to read yet, downloading IS the task. */}
            <button
              type="button"
              className="btn btn-primary btn-block weather-sync__cta"
              onClick={() => void doUpdate()}
              disabled={updating || !online}
            >
              <RefreshCw
                size={16}
                strokeWidth={2.1}
                aria-hidden
                className={updating ? 'weather-sync__spin' : undefined}
              />
              {updating ? 'Downloading forecast…' : 'Download forecast'}
            </button>
          </>
        ) : (
          <p className="weather-sync__meta">Loading saved forecast…</p>
        )}

        {phase.kind === 'updated' ? (
          <p className="sr-only" role="status">
            Forecast updated · {phase.savedLocations} route locations saved
          </p>
        ) : null}
        {phase.kind === 'failed' ? (
          <div className="banner-warn weather-sync__failed" role="status">
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
              first. Sticky below the safe area while the list scrolls, so
              the day stays switchable from anywhere in the list. */}
          <nav className="weather-dates" aria-label="Forecast dates" ref={datesRef}>
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
                      {summary ? (
                        <ChevronDown
                          size={17}
                          strokeWidth={2}
                          aria-hidden
                          className="weather-row__chev"
                        />
                      ) : null}
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
              <p className="weather-sync__meta">
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
