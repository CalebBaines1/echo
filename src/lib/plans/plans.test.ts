import { describe, expect, it } from 'vitest';
import { leaningsFrom, reasonFor } from '@/lib/profile/build';
import { hobbyIdFor } from '@/lib/profile/activities';
import type { MediaSummary, PlaceSummary } from '@/lib/qloo/types';
import { personalFit } from './group';
import { buildIcs } from './ics';
import { formatHours, formatTime, hoursOn, isOpenAt, nextSaturday, weekdayOf } from './time';

describe('formatHours', () => {
  it('reads like a person would say it', () => {
    expect(formatHours('11:00-22:00')).toBe('11am–10pm');
    expect(formatHours('09:30-14:00, 17:00-24:00')).toBe('9:30am–2pm, 5pm–midnight');
    expect(formatHours('00:00-24:00')).toBe('all day');
  });
});

describe('time helpers', () => {
  it('reads weekdays from calendar dates', () => {
    expect(weekdayOf('2026-10-17')).toBe('saturday');
    expect(weekdayOf('2026-10-12')).toBe('monday');
  });

  it('finds the coming Saturday, or today on a Saturday', () => {
    expect(nextSaturday(new Date(2026, 9, 14))).toBe('2026-10-17');
    expect(nextSaturday(new Date(2026, 9, 17))).toBe('2026-10-17');
  });

  it('checks opening hours, including past midnight', () => {
    expect(hoursOn({ saturday: ['11:00-18:30'] }, 'saturday')).toBe('11:00-18:30');
    expect(hoursOn({ saturday: [] }, 'saturday')).toBe('Closed');
    expect(hoursOn({}, 'saturday')).toBeUndefined();
    expect(isOpenAt('11:00-18:30', '13:00')).toBe(true);
    expect(isOpenAt('11:00-18:30', '19:00')).toBe(false);
    expect(isOpenAt('18:00-02:00', '01:00')).toBe(true);
    expect(isOpenAt('Closed', '12:00')).toBe(false);
    expect(isOpenAt(undefined, '12:00')).toBeUndefined();
  });

  it('formats times for people', () => {
    expect(formatTime('13:00')).toBe('1pm');
    expect(formatTime('09:30')).toBe('9:30am');
    expect(formatTime('00:00')).toBe('12am');
  });
});

describe('buildIcs', () => {
  it('writes floating-time events with escaped text', () => {
    const ics = buildIcs([{ title: 'Pottery, finally', date: '2026-10-17', time: '13:00', location: '238 Grand St; Brooklyn' }], () => 'uid-1');
    expect(ics).toContain('DTSTART:20261017T130000');
    expect(ics).toContain('DTEND:20261017T150000');
    expect(ics).toContain('SUMMARY:Pottery\\, finally');
    expect(ics).toContain('LOCATION:238 Grand St\\; Brooklyn');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});

describe('personalFit', () => {
  const place = (reasons: Array<[string, number]>, affinity = 0.8): PlaceSummary => ({
    id: 'p',
    name: 'P',
    tags: [],
    tagIds: [],
    affinity,
    reasons: reasons.map(([id, score]) => ({ kind: 'entity', id, score })),
  });
  const people = [
    { id: 'a', name: 'A', ids: ['a1', 'a2'] },
    { id: 'b', name: 'B', ids: ['b1'] },
  ];

  it('gives everyone the overall match when contributions are even', () => {
    expect(personalFit(place([['a1', 0.2], ['b1', 0.2]]), people)).toEqual({ a: 80, b: 80 });
  });

  it("gives half the match to someone whose tastes didn't contribute", () => {
    expect(personalFit(place([['a1', 0.3]]), people).b).toBe(40);
  });

  it('scores the person whose tastes drove the match higher', () => {
    const fit = personalFit(place([['a1', 0.3], ['a2', 0.3], ['b1', 0.1]]), people);
    expect(fit.a).toBeGreaterThan(fit.b!);
    expect(fit.a).toBeLessThanOrEqual(99);
  });
});

describe('profile helpers', () => {
  const media = (tagRefs: Array<[string, string]>, affinity = 1): MediaSummary => ({
    id: 'm',
    name: 'M',
    type: 'tv_show',
    tags: [],
    tagRefs: tagRefs.map(([id, name]) => ({ id, name })),
    affinity,
    reasons: [
      { kind: 'entity', id: 'e1', score: 0.3 },
      { kind: 'entity', id: 'e2', score: 0.2 },
      { kind: 'entity', id: 'zz', score: 0.1 },
    ],
  });

  it('builds leanings from descriptive tags only', () => {
    const out = leaningsFrom([
      media([['urn:tag:theme:qloo:grief', 'Grief and healing'], ['urn:tag:instrument:qloo:guitar', 'Guitar']]),
      media([['urn:tag:theme:qloo:grief', 'Grief and healing'], ['urn:tag:style:qloo:tender', 'Quietly tender']], 0.5),
    ]);
    expect(out).toEqual([
      { label: 'Grief and healing', score: 100 },
      { label: 'Quietly tender', score: 33 },
    ]);
  });

  it('explains picks with the tastes that contributed most', () => {
    const names = new Map([
      ['e1', 'Severance'],
      ['e2', 'Past Lives'],
    ]);
    expect(reasonFor(media([]), names)).toBe('Because you like Severance and Past Lives');
  });

  it('maps free-form activities to hobbies', () => {
    expect(hobbyIdFor('Ceramics class')).toBe('pottery');
    expect(hobbyIdFor('bouldering')).toBe('climbing');
    expect(hobbyIdFor('vinyl shopping')).toBe('records');
    expect(hobbyIdFor('hiking')).toBeUndefined();
  });
});
