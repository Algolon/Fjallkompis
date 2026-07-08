export declare const PHONE_LANDSCAPE_MAX_HEIGHT: number;

export interface PhoneLandscapeEnv {
  width: number;
  height: number;
  coarsePointer: boolean;
  canHover: boolean;
}

export declare function isPhoneLandscape(env: PhoneLandscapeEnv): boolean;
export declare function readPhoneLandscape(win?: Window): boolean;
export declare function watchPhoneLandscape(
  onChange: (phoneLandscape: boolean) => void,
  win?: Window,
): () => void;
export declare function attemptPhonePortraitLock(win?: Window): boolean;
