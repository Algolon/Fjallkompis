import type { WeatherSnapshot } from './weatherModel.mjs';

export declare const WEATHER_DB_NAME: string;
export declare const WEATHER_DB_VERSION: number;
export declare const WEATHER_META_ID: string;
export declare const WEATHER_SNAPSHOT_ID: string;

export declare function weatherStorageSupported(): boolean;
export declare function closeWeatherDb(): Promise<void>;
export declare function readWeatherSnapshot(): Promise<WeatherSnapshot | null>;
export declare function replaceWeatherSnapshot(snapshot: WeatherSnapshot): Promise<void>;
export declare function clearWeatherSnapshot(): Promise<void>;
