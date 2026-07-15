import type { ExperienceScale, RouteExperience } from '../types';

/** The three display groups, ordered by rising commitment. */
export type ExperienceGroupKey = 'on-route' | 'detours' | 'larger';

export declare const EXPERIENCE_GROUP_ORDER: ExperienceGroupKey[];
export declare const EXPERIENCE_GROUP_LABEL: Record<ExperienceGroupKey, string>;
export declare const GROUP_THRESHOLD: number;

export declare function experienceGroup(scale: ExperienceScale): ExperienceGroupKey;

/** On-route sights expand inline; everything larger opens a detail view. */
export declare function isInlineExperience(scale: ExperienceScale): boolean;

/** Stage-filtered (by stable segment id) + commitment-ordered experiences. */
export declare function selectForStage(
  experiences: RouteExperience[],
  stageId: string,
): RouteExperience[];

/** Whether a stage has any experiences (drives whether the disclosure shows). */
export declare function hasExperiences(
  experiences: RouteExperience[],
  stageId: string,
): boolean;

export type ExperienceDisplay =
  | { grouped: false; items: RouteExperience[] }
  | {
      grouped: true;
      groups: {
        group: ExperienceGroupKey;
        label: string;
        items: RouteExperience[];
      }[];
    };

/** Flat list when short; commitment groups (empty dropped) when longer. */
export declare function groupForDisplay(
  selected: RouteExperience[],
): ExperienceDisplay;

/** Reference-integrity errors ([] when valid). */
export declare function experienceRefErrors(
  experience: RouteExperience,
  knownStageIds: Set<string>,
  knownStopIds: Set<string>,
): string[];
