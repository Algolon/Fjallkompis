/**
 * Resolve a navigate() target to a vNext destination ({ tab, section }).
 *
 * Screen wiring still calls navigate() with the historical internal tab ids
 * ('stages', 'huts', 'checklist') at ~15 call sites; this module is the ONE
 * place that maps them onto the five-tab shell, so no call site had to be
 * rewritten and no deep link changed meaning:
 *
 *   'stages'    → Guide → Stages
 *   'huts'      → Guide → Stops & places
 *   'checklist' → split by its Lists payload — the reference sections
 *                 (Shops, Transport) live in the Guide dossier, the personal
 *                 sections (Trip, Packing) live in Plan. No payload keeps
 *                 Lists' old default: the packing list.
 *
 * 'guide' and 'plan' accept the same Lists payload vocabulary so new callers
 * (Guide's Transport → "Add to Trip") can name their tab directly without
 * reviving a legacy id.
 *
 * Pure and total: any unknown target falls back to that target as a tab with
 * no section — the route table then falls back safely (hashForTab).
 *
 * Plain .mjs so node --test exercises the full mapping behaviourally
 * (tests/vnext-navigation.test.mjs) — this is the "no capability becomes
 * unreachable" guarantee.
 */

/**
 * Where a Lists-era deep-link payload lands in the five-tab shell. Mirrors
 * the retired ListsScreen's initialSectionFor precedence exactly: explicit
 * targets (shopType, transportId/context, trip item/stay/transport launches)
 * win over the section field; no payload defaults to the packing list.
 */
function destinationForListsLink(link) {
  if (!link) return { tab: 'plan', section: 'packing' };
  if (link.shopType) return { tab: 'guide', section: 'shops' };
  if (link.transportId || link.transportContext) {
    return { tab: 'guide', section: 'transport' };
  }
  // Trip launches carry trip ITEMS (transport movements and stays), so they
  // land on Travel & stays — the Wallet is the document-oriented view.
  if (link.tripItemId || link.trackStayPlaceId || link.addTransportEntryId) {
    return { tab: 'plan', section: 'travel' };
  }
  switch (link.section) {
    case 'shops':
      return { tab: 'guide', section: 'shops' };
    case 'transport':
      return { tab: 'guide', section: 'transport' };
    case 'trip':
      return { tab: 'plan', section: 'travel' };
    default:
      return { tab: 'plan', section: 'packing' };
  }
}

/** Resolve a navigate() target (current or legacy) plus payload to { tab, section }. */
export function resolveNavTarget(target, payload) {
  switch (target) {
    case 'stages':
      return { tab: 'guide', section: 'stages' };
    case 'huts':
      return { tab: 'guide', section: 'stops' };
    case 'checklist':
      return destinationForListsLink(payload?.lists);
    case 'guide': {
      // A Lists payload may name a Guide section (Shops/Transport); anything
      // else — or nothing — opens the Guide home.
      const dest = payload?.lists ? destinationForListsLink(payload.lists) : null;
      return dest?.tab === 'guide' ? dest : { tab: 'guide', section: null };
    }
    case 'plan': {
      const dest = payload?.lists ? destinationForListsLink(payload.lists) : null;
      return dest?.tab === 'plan' ? dest : { tab: 'plan', section: null };
    }
    default:
      return { tab: target, section: null };
  }
}
