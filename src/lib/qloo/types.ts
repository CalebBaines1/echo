// Entity types as Insights names them. /search spells video games differently;
// see searchTypeUrn in client.ts.
export type EntityType =
  | 'artist'
  | 'book'
  | 'brand'
  | 'destination'
  | 'locality'
  | 'movie'
  | 'person'
  | 'place'
  | 'podcast'
  | 'tv_show'
  | 'video_game';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Signals {
  entities?: string[];
  tags?: string[];
}

/** Why a result was recommended: how much each input contributed. */
export interface Reason {
  kind: 'entity' | 'tag';
  id: string;
  score: number;
}

export interface EntitySummary {
  id: string;
  name: string;
  type: EntityType | string;
  /** Qloo's disambiguation text, e.g. "2021" or "1965, Frank Herbert". */
  disambiguation?: string;
  year?: number;
}

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

/** Opening hours per day as "HH:MM-HH:MM" ranges; an empty list means closed. */
export type OpeningHours = Partial<Record<Weekday, string[]>>;

export interface PlaceSummary {
  id: string;
  name: string;
  location?: LatLon;
  address?: string;
  neighborhood?: string;
  distanceMeters?: number;
  affinity?: number;
  priceLevel?: number;
  hours?: OpeningHours;
  description?: string;
  website?: string;
  tags: string[];
  tagIds: string[];
  reasons: Reason[];
}

export interface MediaSummary {
  id: string;
  name: string;
  type: EntityType | string;
  year?: number;
  description?: string;
  affinity?: number;
  /** First few tag names, for display. */
  tags: string[];
  /** Every tag with its ID, for analysis such as taste leanings. */
  tagRefs: Array<{ id: string; name: string }>;
  reasons: Reason[];
}

export interface TagSummary {
  id: string;
  name: string;
  type: string;
}

export interface CompareTag {
  id: string;
  name: string;
  type: string;
  /** Shared tags carry a score; one-sided tags carry how many inputs had them. */
  score?: number;
  count?: number;
}

export interface CompareResult {
  shared: CompareTag[];
  onlyA: CompareTag[];
  onlyB: CompareTag[];
}

export interface TrendPoint {
  date: string;
  percentile: number;
  rank: number;
  rankVelocity: number;
  velocityFoldChange: number;
  percentDelta: number;
}
