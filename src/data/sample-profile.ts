import type { MentionType } from '@/lib/onboarding/types';
import type { Activity } from '@/lib/profile/types';

/**
 * The "Try it with a sample profile" person. Only names are stored here; they're
 * matched to Qloo when someone loads the sample, like any typed favorite.
 */
export const SAMPLE_PROFILE: { name: string; tastes: Array<{ name: string; type: MentionType }>; activities: Activity[] } = {
  name: 'Riley',
  tastes: [
    { name: 'Phoebe Bridgers', type: 'artist' },
    { name: 'Bon Iver', type: 'artist' },
    { name: 'Severance', type: 'tv_show' },
    { name: 'Past Lives', type: 'movie' },
    { name: 'Hollow Knight', type: 'video_game' },
    { name: 'Ursula K. Le Guin', type: 'author' },
    { name: "That '70s Show", type: 'tv_show' },
  ],
  activities: [
    { name: 'pottery', status: 'wants_to', hobbyId: 'pottery' },
    { name: 'board games', status: 'does', hobbyId: 'board_games' },
    { name: 'reading', status: 'does', hobbyId: 'books' },
  ],
};
