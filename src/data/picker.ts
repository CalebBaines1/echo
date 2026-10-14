import type { MentionType } from '@/lib/onboarding/types';
import { shuffle } from '@/lib/variety';

/**
 * Well-known titles for the onboarding picker. The client shuffles them on
 * every visit, dealing kinds in turn so no screen is all one thing. Names are
 * matched to Qloo entities on the server; cover art comes from Qloo and others.
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
  { name: 'Breaking Bad', type: 'tv_show' },
  { name: 'Ted Lasso', type: 'tv_show' },
  { name: 'Squid Game', type: 'tv_show' },
  { name: 'Shōgun', type: 'tv_show' },
  { name: 'Arcane', type: 'tv_show' },
  { name: 'The White Lotus', type: 'tv_show' },
  { name: 'Bluey', type: 'tv_show' },
  { name: 'Attack on Titan', type: 'tv_show' },
  { name: 'Gilmore Girls', type: 'tv_show' },
  { name: 'Planet Earth', type: 'tv_show' },
  { name: 'The Great British Bake Off', type: 'tv_show' },
  { name: 'Only Murders in the Building', type: 'tv_show' },
  { name: 'Atlanta', type: 'tv_show' },
  { name: 'Twin Peaks', type: 'tv_show' },
  { name: 'Dune', type: 'movie' },
  { name: 'Inception', type: 'movie' },
  { name: 'Get Out', type: 'movie' },
  { name: 'The Grand Budapest Hotel', type: 'movie' },
  { name: 'Lady Bird', type: 'movie' },
  { name: 'Interstellar', type: 'movie' },
  { name: 'Spider-Man: Into the Spider-Verse', type: 'movie' },
  { name: 'Mamma Mia!', type: 'movie' },
  { name: 'Top Gun: Maverick', type: 'movie' },
  { name: 'Little Women', type: 'movie' },
  { name: 'Before Sunrise', type: 'movie' },
  { name: 'Moonlight', type: 'movie' },
  { name: 'Knives Out', type: 'movie' },
  { name: 'Amélie', type: 'movie' },
  { name: 'Frank Ocean', type: 'artist' },
  { name: 'Billie Eilish', type: 'artist' },
  { name: 'The Beatles', type: 'artist' },
  { name: 'Olivia Rodrigo', type: 'artist' },
  { name: 'Mitski', type: 'artist' },
  { name: 'Daft Punk', type: 'artist' },
  { name: 'Zach Bryan', type: 'artist' },
  { name: 'Kacey Musgraves', type: 'artist' },
  { name: 'Tyler, the Creator', type: 'artist' },
  { name: 'Lana Del Rey', type: 'artist' },
  { name: 'Arctic Monkeys', type: 'artist' },
  { name: 'Noah Kahan', type: 'artist' },
  { name: 'BTS', type: 'artist' },
  { name: 'Hozier', type: 'artist' },
  { name: 'The Hobbit', type: 'book' },
  { name: 'Tomorrow, and Tomorrow, and Tomorrow', type: 'book' },
  { name: 'Educated', type: 'book' },
  { name: 'Circe', type: 'book' },
  { name: 'Atomic Habits', type: 'book' },
  { name: 'The Seven Husbands of Evelyn Hugo', type: 'book' },
  { name: 'A Little Life', type: 'book' },
  { name: 'The Martian', type: 'book' },
  { name: 'Where the Crawdads Sing', type: 'book' },
  { name: 'Pride and Prejudice', type: 'book' },
  { name: 'The Legend of Zelda: Breath of the Wild', type: 'video_game' },
  { name: "Baldur's Gate 3", type: 'video_game' },
  { name: 'Mario Kart 8', type: 'video_game' },
  { name: 'Celeste', type: 'video_game' },
  { name: 'Disco Elysium', type: 'video_game' },
  { name: 'Hades', type: 'video_game' },
  { name: 'Red Dead Redemption 2', type: 'video_game' },
  { name: 'Portal 2', type: 'video_game' },
  { name: 'Hard Fork', type: 'podcast' },
  { name: 'SmartLess', type: 'podcast' },
  { name: 'Stuff You Should Know', type: 'podcast' },
  { name: 'Song Exploder', type: 'podcast' },
  { name: 'The Daily', type: 'podcast' },
  { name: 'Armchair Expert', type: 'podcast' },
  { name: 'Haruki Murakami', type: 'author' },
  { name: 'Stephen King', type: 'author' },
  { name: 'Toni Morrison', type: 'author' },
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
  { name: 'dancing', wiki: 'Salsa (dance)', emoji: '💃', blurb: 'Salsa, swing or a beginner class.' },
  { name: 'gardening', wiki: 'Community gardening', emoji: '🌱', blurb: 'Community gardens and plant swaps.' },
  { name: 'running', wiki: 'Running', emoji: '🏃', blurb: 'Run clubs and easy loops.' },
  { name: 'knitting', wiki: 'Knitting', emoji: '🧶', blurb: 'Knitting circles and yarn shops.' },
  { name: 'chess', wiki: 'Chess', emoji: '♟️', blurb: 'Chess clubs and café games.' },
  { name: 'karaoke', wiki: 'Karaoke', emoji: '🎤', blurb: 'Private rooms or open karaoke nights.' },
  { name: 'trivia nights', wiki: 'Pub quiz', emoji: '🧠', blurb: 'Pub quizzes with a team.' },
  { name: 'museums', wiki: 'Museum', emoji: '🏛️', blurb: 'Small galleries and big museums.' },
  { name: 'baking', wiki: 'Baking', emoji: '🥐', blurb: 'Bread, pastry, baking classes.' },
  { name: 'cycling', wiki: 'Cycling', emoji: '🚲', blurb: 'Bike paths and group rides.' },
  { name: 'stand-up comedy', wiki: 'Stand-up comedy', emoji: '🎭', blurb: 'Comedy clubs and open mics.' },
  { name: 'writing', wiki: 'Creative writing', emoji: '✍️', blurb: 'Writing groups and quiet cafés.' },
  { name: 'volunteering', wiki: 'Volunteering', emoji: '🤝', blurb: 'Food banks, shelters, park cleanups.' },
  { name: 'swimming', wiki: 'Swimming', emoji: '🏊', blurb: 'Pools and open-water swims.' },
];

/**
 * Today's deck: every activity Echo can plan places for, plus a few others at
 * random, in a fresh order. Activities already answered stay in so their
 * answers show.
 */
export function activityDeck(rand: () => number, answered: string[] = [], extras = 4): ActivityCard[] {
  const plannable = ACTIVITY_CARDS.filter((c) => c.hobbyId);
  const others = ACTIVITY_CARDS.filter((c) => !c.hobbyId);
  const keep = others.filter((c) => answered.includes(c.name));
  const rest = shuffle(others.filter((c) => !answered.includes(c.name)), rand).slice(0, Math.max(0, extras - keep.length));
  return shuffle([...plannable, ...keep, ...rest], rand);
}
