import type { WeatherLocationForecast, WeatherSnapshot } from './weatherModel.mjs';

export declare const SMHI_PROVIDER_ID: string;
export declare const SMHI_ATTRIBUTION: string;
export declare const SMHI_POINT_PARAMETERS: string[];

export interface WeatherProviderLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationM: number | null;
}

export declare function smhiPointUrl(lat: number, lon: number): string;
export declare function normalizeSmhiPointForecast(
  json: unknown,
  location: WeatherProviderLocation,
): WeatherLocationForecast & { referenceTime: string | null };
export declare function fetchSmhiRouteSnapshot(
  locations: WeatherProviderLocation[],
  options?: {
    fetchImpl?: typeof fetch;
    now?: () => Date;
  },
): Promise<WeatherSnapshot>;
