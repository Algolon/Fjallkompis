/**
 * Facility → lucide outline icon mapping. Icons are tree-shaken ES imports,
 * bundled locally with the app — no CDN, fully offline.
 */
import {
  Backpack,
  Bus,
  Coffee,
  CookingPot,
  Flame,
  ShoppingBag,
  ShowerHead,
  UserRoundCheck,
  Utensils,
  Wifi,
} from 'lucide-react';
import type { FacilityId } from '../types';

const FACILITY_ICONS: Record<FacilityId, typeof Wifi> = {
  'guest-kitchen': CookingPot,
  shop: ShoppingBag,
  sauna: Flame,
  shower: ShowerHead,
  restaurant: Utensils,
  cafe: Coffee,
  wifi: Wifi,
  'gear-rental': Backpack,
  'public-transport': Bus,
  staffed: UserRoundCheck,
};

export function FacilityIcon({
  id,
  size = 16,
  className,
}: {
  id: FacilityId;
  size?: number;
  className?: string;
}) {
  const Icon = FACILITY_ICONS[id];
  return <Icon size={size} strokeWidth={1.8} className={className} aria-hidden />;
}
