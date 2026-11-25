import { DAYS_LONG } from './labels';
import type { QuizCard, QuizFrequency } from './types';

export const FREQUENCY_LABEL: Record<QuizFrequency, string> = {
  tjedno: 'svaki tjedan',
  svaki_drugi_tjedan: 'svaki drugi tjedan',
  mjesecno: 'jednom mjesečno',
  povremeno: 'povremeno',
};

function atTime(d: Date, time: string | null): Date {
  const out = new Date(d);
  const [h, m] = (time ?? '20:00').split(':').map((x) => parseInt(x, 10));
  out.setHours(h || 0, m || 0, 0, 0);
  return out;
}

/** Sljedeći termin kviza od trenutka `from` (kviz koji je počeo prije < 3 h još se računa kao "sad"). */
export function nextOccurrence(q: QuizCard, from: Date = new Date()): Date | null {
  const grace = 3 * 60 * 60 * 1000;
  if (q.next_date && (q.frequency !== 'tjedno' || q.weekday == null)) {
    const d = atTime(new Date(`${q.next_date}T12:00:00`), q.start_time);
    return d.getTime() + grace >= from.getTime() ? d : null;
  }
  if (q.weekday == null) return null;
  const todayIso = ((from.getDay() + 6) % 7) + 1;
  for (let add = 0; add <= 7; add++) {
    const day = new Date(from);
    day.setDate(from.getDate() + add);
    if (((todayIso - 1 + add) % 7) + 1 !== q.weekday) continue;
    const d = atTime(day, q.start_time);
    if (d.getTime() + grace >= from.getTime()) return d;
  }
  return null;
}

export function formatTime(time: string | null): string {
  return time ? time.slice(0, 5) : '';
}

export function dayHeading(d: Date, now: Date = new Date()): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(now)) / 86400000);
  const name = DAYS_LONG[(d.getDay() + 6) % 7];
  const date = `${d.getDate()}.${d.getMonth() + 1}.`;
  if (diff === 0) return `Danas · ${name} ${date}`;
  if (diff === 1) return `Sutra · ${name} ${date}`;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${date}`;
}

export function scheduleText(q: QuizCard): string {
  if (q.weekday != null && q.frequency !== 'povremeno') {
    return `${DAYS_LONG[q.weekday - 1]} u ${formatTime(q.start_time)} · ${FREQUENCY_LABEL[q.frequency]}`;
  }
  if (q.next_date) {
    const d = new Date(`${q.next_date}T12:00:00`);
    return `${d.getDate()}.${d.getMonth() + 1}. u ${formatTime(q.start_time)}`;
  }
  return FREQUENCY_LABEL[q.frequency];
}
