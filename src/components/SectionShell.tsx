import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * Shell around a Guide/Plan SECTION screen: a slim sub-navigation row with
 * one action — back to the tab's home. The row (not the wrapped screen)
 * absorbs the top safe-area inset; .section-shell compensates the wrapped
 * .screen's own top padding in CSS so the two never stack.
 *
 * Browser/gesture Back also works (sections are history entries), and
 * tapping the active tab pops to the tab's home; this visible affordance is
 * for iOS standalone, which has neither.
 */
export function SectionShell({
  label,
  onBack,
  children,
}: {
  /** The parent tab's name — the back control reads "‹ Guide" / "‹ Plan". */
  label: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="section-shell">
      <div className="subnav">
        <button type="button" className="subnav-back" onClick={onBack}>
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden />
          {label}
        </button>
      </div>
      {children}
    </div>
  );
}
