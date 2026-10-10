import type { MentionType } from '@/lib/onboarding/types';

/**
 * Well-known titles for the onboarding picker, mixed across kinds so the
 * first screen isn't all one thing. Names are matched to Qloo entities on the
 * server; the cover art comes from Qloo.
 */
export const PICKER_SEEDS: Array<{ name: string; type: MentionType }> = [
  { name: 'Severance', type: 'tv_show' },
  { name: 'Taylor Swift', type: 'artist' },
  { name: 'Past Lives', type: 'movie' },
  { name: 'Hollow Knight', type: 'video_game' },
  { name: 'This American Life', type: 'podcast' },
  { name: 'Ursula Le Guin', type: 'author' },
  { name: 'The Bear', type: 'tv_show' },
  { name: 'Kendrick Lamar', type: 'artist' },
  { name: 'Everything Everywhere All at Once', type: 'movie' },
  { name: 'Animal Crossing', type: 'video_game' },
  { name: 'Phoebe Bridgers', type: 'artist' },
  { name: 'Project Hail Mary', type: 'book' },
  { name: 'Succession', type: 'tv_show' },
  { name: 'Bad Bunny', type: 'artist' },
  { name: 'Spirited Away', type: 'movie' },
  { name: 'Stardew Valley', type: 'video_game' },
  { name: 'Radiolab', type: 'podcast' },
  { name: 'Sally Rooney', type: 'author' },
  { name: 'Abbott Elementary', type: 'tv_show' },
  { name: 'Bon Iver', type: 'artist' },
  { name: 'Parasite', type: 'movie' },
  { name: 'Elden Ring', type: 'video_game' },
  { name: 'Pachinko', type: 'book' },
  { name: 'SZA', type: 'artist' },
  { name: 'Fleabag', type: 'tv_show' },
  { name: 'Barbie', type: 'movie' },
  { name: 'Minecraft', type: 'video_game' },
  { name: 'Serial', type: 'podcast' },
  { name: 'Charli XCX', type: 'artist' },
  { name: 'The Office', type: 'tv_show' },
  { name: 'La La Land', type: 'movie' },
  { name: 'The Midnight Library', type: 'book' },
  { name: 'Radiohead', type: 'artist' },
  { name: 'The Last of Us', type: 'tv_show' },
  { name: 'Oppenheimer', type: 'movie' },
  { name: '99% Invisible', type: 'podcast' },
  { name: 'Fleetwood Mac', type: 'artist' },
  { name: 'Stranger Things', type: 'tv_show' },
  { name: 'Beyoncé', type: 'artist' },
  { name: 'Conan O’Brien Needs a Friend', type: 'podcast' },
];

/** Activity chips for onboarding. hobbyId links to a place category when there is one. */
export const ACTIVITY_CHIPS: Array<{ name: string; hobbyId?: string }> = [
  { name: 'pottery', hobbyId: 'pottery' },
  { name: 'board games', hobbyId: 'board_games' },
  { name: 'climbing', hobbyId: 'climbing' },
  { name: 'record shopping', hobbyId: 'records' },
  { name: 'reading', hobbyId: 'books' },
  { name: 'drawing and painting', hobbyId: 'art' },
  { name: 'indie film', hobbyId: 'film' },
  { name: 'live music', hobbyId: 'live_music' },
  { name: 'hiking' },
  { name: 'cooking' },
  { name: 'yoga' },
  { name: 'photography' },
];
