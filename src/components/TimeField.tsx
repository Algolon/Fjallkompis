import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, InputHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import {
  pad2,
  parseHourText,
  parseIsoTime,
  parseMinuteText,
  stepHour,
  stepMinute,
  toIsoTime,
} from '../utils/dateTimeField.mjs';

/**
 * App-owned time field: a closed field opening a digital 24-hour HH:mm
 * dialog — direct typing (numeric keyboard on mobile) plus steppers; no
 * analog clock face, no wheels. Companion to DateField; same caller
 * contract as the native `<input type="time">` it replaces: `value` is ''
 * or 'HH:mm', only Set and Clear ever call `onChange`.
 */
export function TimeField({
  label,
  dialogTitle,
  value,
  onChange,
  style,
}: {
  label: string;
  dialogTitle?: string;
  /** '' or 'HH:mm' (24-hour). */
  value: string;
  onChange: (next: string) => void;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const display = parseIsoTime(value) ? value : null;
  return (
    <>
      {/* Dialog rendered as a sibling of the label — see DateField. */}
      <label className="field" style={style}>
        <span>{label}</span>
        <button
          type="button"
          className="input picker-field"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <span className={display ? undefined : 'picker-field__empty'}>
            {display ?? 'Not set'}
          </span>
          <Clock size={16} strokeWidth={1.8} aria-hidden />
        </button>
      </label>
      {open ? (
        <TimeFieldDialog
          title={dialogTitle ?? label}
          value={value}
          onCommit={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Strip non-digits and cap at two characters — what the boxes accept. */
function cleanTimeText(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 2);
}

export function TimeFieldDialog({
  title,
  value,
  onCommit,
  onClose,
}: {
  title: string;
  value: string;
  /** Called with 'HH:mm' on Set, '' on Clear — never on Cancel. */
  onCommit: (next: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hourRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const errorId = useId();

  const initial = parseIsoTime(value);
  const [hourText, setHourText] = useState(initial ? pad2(initial.hour) : '');
  const [minuteText, setMinuteText] = useState(initial ? pad2(initial.minute) : '');

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    hourRef.current?.focus();
    hourRef.current?.select();
    return () => opener?.focus();
  }, []);

  const hour = parseHourText(hourText);
  const minute = parseMinuteText(minuteText);
  // Hour is required to Set; an empty minute box commits as :00 (typing
  // "14" then Set gives 14:00). Clear is the way to commit "no time".
  const effectiveMinute = minuteText === '' ? 0 : minute;
  const canSet = hour !== null && effectiveMinute !== null;
  const invalidHour = hourText !== '' && hour === null;
  const invalidMinute = minuteText !== '' && minute === null;
  const errorText = invalidHour
    ? 'Hours go from 00 to 23.'
    : invalidMinute
      ? 'Minutes go from 00 to 59.'
      : null;

  const close = () => dialogRef.current?.close();
  const commitAndClose = (next: string) => {
    onCommit(next);
    close();
  };
  const trySet = () => {
    if (canSet) commitAndClose(toIsoTime(hour, effectiveMinute));
  };

  const bumpHour = (dir: 1 | -1) => setHourText(pad2(stepHour(hour, dir)));
  const bumpMinute = (dir: 1 | -1) => setMinuteText(pad2(stepMinute(minute, dir)));

  /** Shared input behaviour: Enter sets, arrows step, blur zero-pads. */
  const inputProps = (
    kind: 'hour' | 'minute',
  ): InputHTMLAttributes<HTMLInputElement> => ({
    className: 'picker-time__input',
    inputMode: 'numeric',
    autoComplete: 'off',
    maxLength: 2,
    onFocus: (e) => e.currentTarget.select(),
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        trySet();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        if (kind === 'hour') bumpHour(dir);
        else bumpMinute(dir);
      }
    },
    onBlur: () => {
      // Preserve leading zeroes: a typed "7" reads back as "07".
      if (kind === 'hour' && hour !== null) setHourText(pad2(hour));
      if (kind === 'minute' && minute !== null) setMinuteText(pad2(minute));
    },
  });

  return (
    <dialog
      ref={dialogRef}
      className="picker-dialog picker-dialog--time"
      aria-labelledby={headingId}
      onClose={(e) => {
        // Stop React's synthetic re-bubbling — see DateField's dialog.
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
    >
      <div className="picker-body">
        <p className="picker-eyebrow">Time</p>
        <h2 className="picker-title" id={headingId}>
          {title}
        </h2>

        <div className="picker-time" role="group" aria-label={`${title}, 24-hour time`}>
          <div className="picker-time__col">
            <button
              type="button"
              className="picker-nav-btn"
              aria-label="Hour up"
              onClick={() => bumpHour(1)}
            >
              <ChevronUp size={18} strokeWidth={2} aria-hidden />
            </button>
            <input
              ref={hourRef}
              aria-label="Hour (00–23)"
              aria-invalid={invalidHour || undefined}
              aria-describedby={errorText ? errorId : undefined}
              value={hourText}
              placeholder="––"
              onChange={(e) => setHourText(cleanTimeText(e.target.value))}
              {...inputProps('hour')}
            />
            <button
              type="button"
              className="picker-nav-btn"
              aria-label="Hour down"
              onClick={() => bumpHour(-1)}
            >
              <ChevronDown size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <span className="picker-time__colon" aria-hidden>
            :
          </span>

          <div className="picker-time__col">
            <button
              type="button"
              className="picker-nav-btn"
              aria-label="Minutes up (5-minute steps)"
              onClick={() => bumpMinute(1)}
            >
              <ChevronUp size={18} strokeWidth={2} aria-hidden />
            </button>
            <input
              aria-label="Minutes (00–59)"
              aria-invalid={invalidMinute || undefined}
              aria-describedby={errorText ? errorId : undefined}
              value={minuteText}
              placeholder="––"
              onChange={(e) => setMinuteText(cleanTimeText(e.target.value))}
              {...inputProps('minute')}
            />
            <button
              type="button"
              className="picker-nav-btn"
              aria-label="Minutes down (5-minute steps)"
              onClick={() => bumpMinute(-1)}
            >
              <ChevronDown size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        {errorText ? (
          <p className="picker-error" id={errorId} role="alert">
            {errorText}
          </p>
        ) : null}

        <div className="picker-actions">
          <button type="button" className="btn picker-btn" onClick={() => commitAndClose('')}>
            Clear
          </button>
          <button type="button" className="btn picker-btn" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn picker-btn-set" disabled={!canSet} onClick={trySet}>
            Set time
          </button>
        </div>
      </div>
    </dialog>
  );
}
