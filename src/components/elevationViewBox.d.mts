/** Type surface of elevationViewBox.mjs (plain ESM so node --test can fence it). */

export const CHART_W: number;
export const CHART_H: number;
export const PAD_L: number;
export const PAD_R: number;
export const PAD_T: number;
export const PAD_B: number;
export const MIN_VB_H: number;

export function viewBoxHeightFor(
  boxWidth: number,
  boxHeight: number,
): number | null;

export function shouldUpdateViewBoxHeight(
  current: number,
  next: number | null,
): boolean;
