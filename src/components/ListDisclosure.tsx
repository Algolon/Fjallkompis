import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Collapsible card built on the app's established accordion visual language
 * (the `.stop-*` classes the Stops screen uses) so Shop info and Transport
 * reuse one pattern rather than introducing a parallel one. Controlled: the
 * parent owns open state, which lets each view decide single- vs multi-open.
 *
 * Accessibility: the header is a real <button> with aria-expanded/aria-controls
 * pointing at the region it discloses; the heading level is caller-chosen so
 * reading order stays logical within each screen.
 */
export function ListDisclosure({
  id,
  title,
  subtitle,
  headerRight,
  open,
  onToggle,
  children,
  headingLevel = 'h3',
}: {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  headingLevel?: 'h2' | 'h3';
}) {
  const headerId = `disc-h-${id}`;
  const panelId = `disc-p-${id}`;
  const Heading = headingLevel;

  return (
    <section className={`card stop-card disc-card ${open ? 'is-open' : ''}`}>
      <Heading className="stop-heading">
        <button
          id={headerId}
          className="stop-header"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="stop-header-main">
            <span className="stop-name">{title}</span>
            {subtitle ? <span className="stop-meta">{subtitle}</span> : null}
          </span>
          {headerRight ? <span className="disc-header-right">{headerRight}</span> : null}
          <ChevronDown className="stop-chevron" size={20} strokeWidth={2} aria-hidden />
        </button>
      </Heading>
      <div id={panelId} role="region" aria-labelledby={headerId} className="stop-panel" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
