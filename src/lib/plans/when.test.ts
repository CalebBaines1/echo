import { describe, expect, it } from 'vitest';
import { defaultWhen, parseWhen, whenLabel } from './when';

// Wednesday Oct 14, 2026, 10:00 local.
const WED = new Date(2026, 9, 14, 10, 0);

describe('parseWhen', () => {
  it('reads relative days and parts of the day', () => {
    expect(parseWhen('something tonight', WED)).toEqual({ date: '2026-10-14', part: 'evening' });
    expect(parseWhen('tomorrow morning?', WED)).toEqual({ date: '2026-10-15', part: 'morning' });
    expect(parseWhen('today', WED)).toEqual({ date: '2026-10-14', part: 'any' });
  });

  it('reads weekday names, short or long', () => {
    expect(parseWhen('Tuesday evening near the park', WED)).toEqual({ date: '2026-10-20', part: 'evening' });
    expect(parseWhen('sat afternoon', WED)).toEqual({ date: '2026-10-17', part: 'afternoon' });
    expect(parseWhen('next wednesday', WED)).toEqual({ date: '2026-10-21', part: 'any' });
  });

  it('reads the weekend and returns null when nothing is said', () => {
    expect(parseWhen('this weekend', WED)).toEqual({ date: '2026-10-17', part: 'any' });
    expect(parseWhen('pottery under $40', WED)).toBeNull();
  });
});

describe('defaultWhen', () => {
  it('picks a weekday evening early in the week', () => {
    expect(defaultWhen('hobby', WED)).toEqual({ date: '2026-10-14', part: 'evening' });
    expect(defaultWhen('hobby', new Date(2026, 9, 14, 18))).toEqual({ date: '2026-10-15', part: 'evening' });
  });

  it('picks the weekend from Thursday evening, and always for a full day', () => {
    expect(defaultWhen('hobby', new Date(2026, 9, 15, 18))).toEqual({ date: '2026-10-17', part: 'any' });
    expect(defaultWhen('day', WED)).toEqual({ date: '2026-10-17', part: 'any' });
    expect(defaultWhen('day', new Date(2026, 9, 17, 16))).toEqual({ date: '2026-10-18', part: 'any' });
  });
});

describe('whenLabel', () => {
  it('names days the way people say them', () => {
    expect(whenLabel({ date: '2026-10-14', part: 'evening' }, WED)).toBe('Tonight');
    expect(whenLabel({ date: '2026-10-15', part: 'morning' }, WED)).toBe('Tomorrow morning');
    expect(whenLabel({ date: '2026-10-17', part: 'any' }, WED)).toBe('Saturday');
    expect(whenLabel({ date: '2026-10-27', part: 'evening' }, WED)).toBe('Tue, Oct 27, evening');
  });
});
