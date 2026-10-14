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

export interface ActivityCard {
  name: string;
  hobbyId?: string;
  /** Wikipedia article whose lead photo illustrates the card. */
  wiki: string;
  emoji: string;
  blurb: string;
}

/** The activity swipe deck in onboarding. hobbyId links to a place category Echo can plan. */
export const ACTIVITY_CARDS: ActivityCard[] = [
  { name: 'pottery', hobbyId: 'pottery', wiki: 'Pottery', emoji: '🏺', blurb: 'Wheel throwing or hand building at a studio.' },
  { name: 'climbing', hobbyId: 'climbing', wiki: 'Bouldering', emoji: '🧗', blurb: 'Bouldering and ropes at an indoor gym.' },
  { name: 'board games', hobbyId: 'board_games', wiki: 'Board game', emoji: '🎲', blurb: 'Game cafés and game nights.' },
  { name: 'live music', hobbyId: 'live_music', wiki: 'Concert', emoji: '🎸', blurb: 'Small venues, local bands, open mics.' },
  { name: 'record shopping', hobbyId: 'records', wiki: 'Record shop', emoji: '💿', blurb: 'Digging through crates for vinyl.' },
  { name: 'drawing and painting', hobbyId: 'art', wiki: 'Watercolor painting', emoji: '🎨', blurb: 'Sketching, watercolor, art classes.' },
  { name: 'indie film', hobbyId: 'film', wiki: 'Movie theater', emoji: '🎬', blurb: 'Small cinemas and screenings.' },
  { name: 'reading', hobbyId: 'books', wiki: 'Bookselling', emoji: '📚', blurb: 'Bookshops, reading spots, book clubs.' },
  { name: 'hiking', wiki: 'Hiking', emoji: '🥾', blurb: 'Trails and day hikes nearby.' },
  { name: 'cooking', wiki: 'Cooking', emoji: '🍳', blurb: 'Cooking classes and trying new recipes.' },
  { name: 'yoga', wiki: 'Yoga as exercise', emoji: '🧘', blurb: 'Studios and drop-in classes.' },
  { name: 'photography', wiki: 'Photography', emoji: '📷', blurb: 'Photo walks and film cameras.' },
];
