/**
 * Settings → topographic "Offline map" download card.
 *
 * Thin wrapper preserved for backwards compatibility: the download UI is now
 * the reusable OfflineAssetCard, driven by the topographic registry entry.
 */
import { OfflineAssetCard } from './OfflineAssetCard';
import { TOPO_ASSET } from '../map/offlineMap';

export function OfflineMapCard() {
  return <OfflineAssetCard asset={TOPO_ASSET} />;
}
