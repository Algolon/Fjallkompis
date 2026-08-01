import type { PlannedDay } from '../plan/plannedDays.mjs';
import type { WalletDocument } from '../types';

export declare function linkedTravelAttachmentIds(day: PlannedDay | null): string[];
export declare function linkedTravelDocuments(
  day: PlannedDay | null,
  documents: readonly WalletDocument[],
): WalletDocument[];
