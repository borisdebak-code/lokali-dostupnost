import OpeningHours from 'opening_hours';
import type { Venue } from './types';

const cache = new Map<string, OpeningHours | null>();

function parse(v: Pick<Venue, 'opening_hours' | 'lat' | 'lng'>): OpeningHours | null {
  if (!v.opening_hours) return null;
  const key = v.opening_hours;
  if (cache.has(key)) return cache.get(key)!;
  let oh: OpeningHours | null = null;
  try {
    // Croatian public holidays (PH) are resolved from country_code.
    oh = new OpeningHours(v.opening_hours, {
      lat: String(v.lat),
      lon: String(v.lng),
      address: { country_code: 'hr', state: '' },
    });
  } catch {
    oh = null;
  }
  cache.set(key, oh);
  return oh;
}

/** true = otvoreno, false = zatvoreno, null = ne znamo */
export function isOpenAt(v: Venue, at: Date): boolean | null {
  const oh = parse(v);
  if (!oh) return null;
  try {
    if (oh.getUnknown(at)) return null;
    return oh.getState(at);
  } catch {
    return null;
  }
}

/** true = u sezoni, false = izvan sezone, null = ne znamo */
export function isInSeason(v: Venue, at: Date): boolean | null {
  if (v.seasonality === 'cijela_godina') return true;
  if (v.seasonality !== 'sezonski' || !v.season_start_month || !v.season_end_month) return null;
  const m = at.getMonth() + 1;
  const { season_start_month: s, season_end_month: e } = v;
  return s <= e ? m >= s && m <= e : m >= s || m <= e;
}

export function prettyHours(v: Venue): string | null {
  const oh = parse(v);
  if (!oh) return v.opening_hours;
  try {
    return oh
      .prettifyValue({ rule_sep_string: '\n', print_semicolon: false })
      .replace(/\bMo\b/g, 'Pon').replace(/\bTu\b/g, 'Uto').replace(/\bWe\b/g, 'Sri')
      .replace(/\bTh\b/g, 'Čet').replace(/\bFr\b/g, 'Pet').replace(/\bSa\b/g, 'Sub')
      .replace(/\bSu\b/g, 'Ned').replace(/\bPH\b/g, 'Praznici').replace(/\boff\b/g, 'zatvoreno');
  } catch {
    return v.opening_hours;
  }
}
