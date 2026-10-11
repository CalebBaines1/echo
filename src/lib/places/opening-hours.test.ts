import { describe, expect, it } from 'vitest';
import { parseOpeningHours } from './opening-hours';

describe('parseOpeningHours', () => {
  it('reads day ranges, lists and closed days', () => {
    expect(parseOpeningHours('Mo-Tu off; We-Sa 11:00-19:30; Su 12:00-18:00')).toEqual({
      monday: [],
      tuesday: [],
      wednesday: ['11:00-19:30'],
      thursday: ['11:00-19:30'],
      friday: ['11:00-19:30'],
      saturday: ['11:00-19:30'],
      sunday: ['12:00-18:00'],
    });
    expect(parseOpeningHours('Mo,We 10:00-14:00,16:00-20:00')).toEqual({ monday: ['10:00-14:00', '16:00-20:00'], wednesday: ['10:00-14:00', '16:00-20:00'] });
  });
  it('wraps ranges across the week and handles 24/7', () => {
    expect(Object.keys(parseOpeningHours('Sa-Mo 10:00-12:00')!)).toEqual(['saturday', 'sunday', 'monday']);
    expect(parseOpeningHours('24/7')!.friday).toEqual(['00:00-24:00']);
  });
  it('gives up on forms it does not understand', () => {
    expect(parseOpeningHours('Mo-Fr 10:00-18:00; PH off')).toBeUndefined();
    expect(parseOpeningHours('sunrise-sunset')).toBeUndefined();
    expect(parseOpeningHours(undefined)).toBeUndefined();
  });
});
