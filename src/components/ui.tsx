import type { ReactNode } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { IconWifi, IconWifiOff } from './Icons';

export function ScreenHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="screen-head">
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </header>
  );
}

/** Compact SVG progress ring used on the Today screen. */
export function ProgressRing({
  percent,
  size = 56,
}: {
  percent: number;
  size?: number;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c * (1 - clamped / 100);
  return (
    <svg width={size} height={size} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--line)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--good)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  );
}

export function OnlineBadge() {
  const online = useOnlineStatus();
  return (
    <span className={`pill ${online ? 'pill-glacier' : 'pill-good'}`}>
      {online ? <IconWifi /> : <IconWifiOff />}
      {online ? 'Online' : 'Offline · all set'}
    </span>
  );
}
