/** TypeScript surface for the plain-ESM Thunderforest benchmark layer. */
import type { RasterSourceSpecification, RasterLayerSpecification } from 'maplibre-gl';

export declare const THUNDERFOREST_STYLE_ID: 'thunderforest-outdoors';
export declare const THUNDERFOREST_SOURCE: string;
export declare const THUNDERFOREST_LAYER: string;
export declare const THUNDERFOREST_TILE_SIZE: number;
export declare const THUNDERFOREST_MINZOOM: number;
export declare const THUNDERFOREST_MAXZOOM: number;

export declare function thunderforestTileUrl(apiKey: string): string;
export declare function thunderforestSource(
  apiKey: string | null | undefined,
  attributionHtml: string,
): RasterSourceSpecification | null;
export declare function thunderforestRasterLayer(): RasterLayerSpecification;
