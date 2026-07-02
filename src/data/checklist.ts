import type { ChecklistCategory, ChecklistItem } from '../types';

/**
 * Stable IDs are derived from category + index so that persisted "checked"
 * state survives reorders of the labels. If you change the *meaning* of an
 * item, give it a new id (or users keep an old tick on a new task).
 */
function mk(categoryId: string, labels: string[]): ChecklistItem[] {
  return labels.map((label, i) => ({
    id: `${categoryId}.${i + 1}`,
    label,
  }));
}

export const CHECKLIST: ChecklistCategory[] = [
  {
    id: 'morning',
    title: 'Morning',
    hint: 'Before you leave the hut.',
    items: mk('morning', [
      'Pack sleeping liner',
      'Refill water',
      'Check feet / blisters',
      'Pack rain shell accessible',
    ]),
  },
  {
    id: 'on-trail',
    title: 'On Trail',
    hint: 'Keep ticking as you go.',
    items: mk('on-trail', [
      'Snack accessible',
      'Check next waypoint',
      'Refill water when possible',
    ]),
  },
  {
    id: 'evening',
    title: 'Evening',
    hint: 'Settle in and reset for tomorrow.',
    items: mk('evening', [
      'Dry socks / base layer',
      'Journal entry',
      "Prepare tomorrow's food",
    ]),
  },
  {
    id: 'safety',
    title: 'Safety',
    hint: 'Non-negotiables. Check daily.',
    items: mk('safety', [
      'Power bank level checked',
      'Offline backup map available',
      'SOS device accessible',
    ]),
  },
  {
    id: 'food-water',
    title: 'Food & Water',
    hint: 'Plan the day around what you can carry.',
    items: mk('food-water', [
      'Breakfast planned',
      'Dinner planned',
      'Emergency food untouched',
    ]),
  },
];

export const ALL_CHECKLIST_ITEMS: ChecklistItem[] = CHECKLIST.flatMap(
  (c) => c.items,
);

export const TOTAL_CHECKLIST_ITEMS = ALL_CHECKLIST_ITEMS.length;
