import type { NavTarget } from '../components/TabBar';
import type { NavPayload } from '../screens/TodayScreen';
import type { Destination } from './routes.mjs';

export declare function resolveNavTarget(
  target: NavTarget,
  payload?: NavPayload,
): Destination;
