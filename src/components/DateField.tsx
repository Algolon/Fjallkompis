import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  WEEKDAY_HEADERS,
  addDays,
  addMonths,
  buildMonthGrid,
  clampDay,
  formatDateFieldLabel,
  formatDayAria,
  formatMonthTitle,
  parseIsoDate,
  toIsoDate,
  weekdayIndex,
} from '../utils/dateTimeField.mjs';
import type { DateParts } from '../utils/dateTimeField.mjs';
import { todayIso } from '../utils/format';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

/**
 * App-owned date field: a closed field that opens a one-month calendar
 * dialog (Stage 1 of the custom picker system — replaces the native
 * `<input type="date">` popup, whose OS-rendered action row overflows on
 * the owner's Android device; docs/proposals/datetime-picker-system.md).
 *
 * Contract with the caller is identical to the native input it replaces:
 * `value` is '' or 'YYYY-MM-DD', `onChange` receives the same shape, and
 * nothing is committed on Cancel/Escape/backdrop — only Set and Clear
 * call `onChange`. Persistence stays wherever the caller put it (the trip
 * sheet still applies everything on Save).
 */
export function DateField({
  label,
  dialogTitle,
  value,
  onChange,
  style,
  invalid,
  describedBy,
}: {
  /** Visible field label ("Date (optional)"). */
  label: string;
  /** Dialog heading; defaults to the field label. */
  dialogTitle?: string;
  /** '' or 'YYYY-MM-DD'. */
  value: string;
  onChange: (next: string) => void;
  style?: CSSProperties;
  /** Caller-owned validation state (e.g. the stay date-order rule) —
      surfaces on the closed field exactly as it did on the native input. */
  invalid?: boolean;
  /** id of the caller's error text, associated while `invalid`. */
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const display = formatDateFieldLabel(value);
  return (
    <>
      {/* The dialog is a sibling, NOT a child, of the <label>: a label
          forwards clicks to its control, so day buttons inside it would
          re-activate the trigger. */}
      <label className="field" style={style}>
        <span>{label}</span>
        <button
          type="button"
          className="input picker-field"
          aria-haspopup="dialog"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? describedBy : undefined}
          onClick={() => setOpen(true)}
        >
          <span className={display ? undefined : 'picker-field__empty'}>
            {display ?? 'Not set'}
          </span>
          <CalendarDays size={16} strokeWidth={1.8} aria-hidden />
        </button>
      </label>
      {open ? (
        <DateFieldDialog
          title={dialogTitle ?? label}
          value={value}
          onCommit={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * One-month calendar grid in a centred native <dialog> (the
 * credential-viewer presentation pattern: top-layer focus trap, Escape,
 * backdrop, scale-from-centre entrance). Keyboard follows the APG grid
 * pattern: arrows move the day, Home/End the week edges, PageUp/PageDown
 * the month (Shift: year), Enter/Space select, Escape cancels.
 */
export function DateFieldDialog({
  title,
  value,
  onCommit,
  onClose,
}: {
  title: string;
  value: string;
  /** Called with 'YYYY-MM-DD' on Set, '' on Clear — never on Cancel. */
  onCommit: (next: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();
  const gridRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const monthId = useId();

  const today = parseIsoDate(todayIso());
  // A malformed stored value degrades to "no selection", never a crash:
  // the calendar opens on today's month with nothing selected.
  const [sel, setSel] = useState<DateParts | null>(() => parseIsoDate(value));
  const [focus, setFocus] = useState<DateParts>(
    () => parseIsoDate(value) ?? today ?? { year: 2026, month: 1, day: 1 },
  );
  // Set by keyboard navigation only: mouse month-paging must not steal
  // focus from the nav buttons.
  const wantGridFocus = useRef(false);

  const focusGridDay = () => {
    gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  };

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    focusGridDay();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    if (wantGridFocus.current) {
      wantGridFocus.current = false;
      focusGridDay();
    }
  });

  const close = () => dialogRef.current?.close();
  const commitAndClose = (next: string) => {
    onCommit(next);
    close();
  };

  const moveFocus = (next: DateParts, e: ReactKeyboardEvent) => {
    e.preventDefault();
    wantGridFocus.current = true;
    setFocus(next);
  };

  const onGridKey = (e: ReactKeyboardEvent) => {
    const { year, month, day } = focus;
    switch (e.key) {
      case 'ArrowLeft':
        return moveFocus(addDays(year, month, day, -1), e);
      case 'ArrowRight':
        return moveFocus(addDays(year, month, day, 1), e);
      case 'ArrowUp':
        return moveFocus(addDays(year, month, day, -7), e);
      case 'ArrowDown':
        return moveFocus(addDays(year, month, day, 7), e);
      case 'Home':
        return moveFocus(addDays(year, month, day, -weekdayIndex(year, month, day)), e);
      case 'End':
        return moveFocus(addDays(year, month, day, 6 - weekdayIndex(year, month, day)), e);
      case 'PageUp':
      case 'PageDown': {
        const delta = e.key === 'PageUp' ? -1 : 1;
        const next = e.shiftKey
          ? { year: year + delta, month }
          : addMonths(year, month, delta);
        return moveFocus(
          { ...next, day: clampDay(next.year, next.month, day) },
          e,
        );
      }
    }
  };

  const pageMonth = (delta: number) => {
    const next = addMonths(focus.year, focus.month, delta);
    setFocus({ ...next, day: clampDay(next.year, next.month, focus.day) });
  };

  const grid = buildMonthGrid(focus.year, focus.month);

  return (
    <dialog
      ref={dialogRef}
      className="picker-dialog"
      aria-labelledby={headingId}
      onClose={(e) => {
        // The native close event doesn't bubble, but React's synthetic
        // event system re-bubbles it through the COMPONENT tree — without
        // this stop it reaches the host sheet's onClose and closes the
        // whole form underneath the picker.
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
      onClick={(e) => {
        // Backdrop click cancels — same contract as the app's sheets.
        if (e.target === dialogRef.current) close();
      }}
    >
      <div className="picker-body">
        <p className="picker-eyebrow">Date</p>
        <h2 className="picker-title" id={headingId}>
          {title}
        </h2>

        <div className="picker-cal-nav">
          <button
            type="button"
            className="picker-nav-btn"
            aria-label="Previous month"
            onClick={() => pageMonth(-1)}
          >
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
          </button>
          <span className="picker-cal-month" id={monthId} aria-live="polite">
            {formatMonthTitle(focus.year, focus.month)}
          </span>
          <button
            type="button"
            className="picker-nav-btn"
            aria-label="Next month"
            onClick={() => pageMonth(1)}
          >
            <ChevronRight size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div
          role="grid"
          aria-labelledby={monthId}
          className="picker-cal"
          ref={gridRef}
          onKeyDown={onGridKey}
        >
          <div role="row" className="picker-cal__row">
            {WEEKDAY_HEADERS.map((wd, i) => (
              <span
                key={wd}
                role="columnheader"
                className="picker-cal__weekday"
                aria-label={
                  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]
                }
              >
                {wd}
              </span>
            ))}
          </div>
          {grid.map((week, w) => (
            <div role="row" className="picker-cal__row" key={w}>
              {week.map((day, i) => {
                if (day === null) {
                  return <span role="gridcell" className="picker-cal__blank" key={`b${i}`} />;
                }
                const isSel =
                  sel !== null &&
                  sel.year === focus.year &&
                  sel.month === focus.month &&
                  sel.day === day;
                const isToday =
                  today !== null &&
                  today.year === focus.year &&
                  today.month === focus.month &&
                  today.day === day;
                return (
                  <button
                    key={day}
                    type="button"
                    role="gridcell"
                    className={`picker-cal__day${isSel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                    tabIndex={day === focus.day ? 0 : -1}
                    aria-selected={isSel}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={formatDayAria(focus.year, focus.month, day)}
                    onClick={() => {
                      setSel({ year: focus.year, month: focus.month, day });
                      setFocus({ year: focus.year, month: focus.month, day });
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Wrap-tolerant action row: long labels stack instead of
            overflowing (the exact failure of the native Android popup). */}
        <div className="picker-actions">
          <button type="button" className="btn picker-btn" onClick={() => commitAndClose('')}>
            Clear
          </button>
          <button type="button" className="btn picker-btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn picker-btn-set"
            disabled={sel === null}
            onClick={() => sel && commitAndClose(toIsoDate(sel.year, sel.month, sel.day))}
          >
            Set date
          </button>
        </div>
      </div>
    </dialog>
  );
}
