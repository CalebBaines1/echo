// Tag IDs looked up once with /v2/tags so missions don't spend calls on them.
// Add a hobby here after checking its tag in a cached /v2/tags response.

export interface Hobby {
  id: string;
  label: string;
  /** Plural place noun for step text, e.g. "pottery studios". */
  places: string;
  /** Place category tag used with findPlaces. */
  placeTag: string;
}

export const HOBBIES: Hobby[] = [
  { id: 'pottery', places: 'pottery studios', label: 'Wheel pottery', placeTag: 'urn:tag:category:place:pottery_classes' },
  { id: 'board_games', places: 'board game cafés', label: 'Board games', placeTag: 'urn:tag:category:place:board_game_club' },
  { id: 'climbing', places: 'climbing gyms', label: 'Indoor climbing', placeTag: 'urn:tag:category:place:rock_climbing_gym' },
  { id: 'records', places: 'record stores', label: 'Record digging', placeTag: 'urn:tag:category:place:record_store' },
  { id: 'books', places: 'bookshops', label: 'Bookshops and reading', placeTag: 'urn:tag:category:place:book_store' },
  { id: 'art', places: 'art supply stores', label: 'Drawing and painting', placeTag: 'urn:tag:category:place:art_supply_store' },
  { id: 'film', places: 'independent cinemas', label: 'Independent film', placeTag: 'urn:tag:category:place:movie_theater' },
  { id: 'live_music', places: 'live music venues', label: 'Live music', placeTag: 'urn:tag:category:place:live_music_venue' },
];

export const PLACE_TAGS = {
  cafe: 'urn:tag:category:place:cafe',
} as const;

/** Everything the planner can search: hobbies plus everyday stops for full days out. */
export const PLACE_CATEGORIES: Hobby[] = [...HOBBIES, { id: 'cafe', label: 'Cafés', places: 'cafés', placeTag: PLACE_TAGS.cafe }];

export function placeCategory(idOrTag: string): Hobby | undefined {
  return PLACE_CATEGORIES.find((c) => c.id === idOrTag || c.placeTag === idOrTag);
}

/** Mood and fit filters. Combine with a category tag using tagOperator 'intersection'. */
export const VIBE_TAGS = {
  quiet: 'urn:tag:noise_level:qloo:quiet',
  cozy: 'urn:tag:ambience:qloo:cozy',
  soloFriendly: 'urn:tag:good_for:qloo:solo_dining',
  handsOn: 'urn:tag:style:qloo:hands_on',
  goodForGroups: 'urn:tag:resy:collection:place:good_for_groups',
} as const;

export function hobbyById(id: string): Hobby | undefined {
  return HOBBIES.find((h) => h.id === id);
}
