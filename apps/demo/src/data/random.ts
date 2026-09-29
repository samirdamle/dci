/** A tiny seeded PRNG (mulberry32): the same seed always gives the same data. */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    /** A multiple of `step` in [min, max]. */
    round: (min: number, max: number, step: number) => Math.round(int(min, max) / step) * step,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
  };
}

export type Random = ReturnType<typeof createRandom>;

const CHECKSUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

/**
 * A Salesforce-style 18-character id: a 3-character key prefix, a
 * 12-character body, and the real case-sensitivity checksum suffix.
 */
export function sfId(prefix: string, n: number): string {
  const id15 = `${prefix}Hs0${String(n).padStart(9, '0')}`;
  let suffix = '';
  for (let chunk = 0; chunk < 3; chunk++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) {
      const c = id15.charAt(chunk * 5 + i);
      if (c >= 'A' && c <= 'Z') bits |= 1 << i;
    }
    suffix += CHECKSUM.charAt(bits);
  }
  return id15 + suffix;
}

/** Key prefixes, as in Salesforce (custom objects use `a0…`). */
export const PREFIX = {
  User: '005',
  Account: '001',
  Contact: '003',
  Opportunity: '006',
  OpportunityLineItem: '00k',
  Lead: '00Q',
  Task: '00T',
  Campaign: '701',
  EmailSend: 'a0S',
  Journey: 'a0J',
  JourneyStep: 'a0T',
  Segment: 'a0G',
} as const;

export type ObjectName = keyof typeof PREFIX;

/** The object type of an id, from its key prefix. */
export function objectOf(id: string): ObjectName | null {
  const prefix = id.slice(0, 3);
  const entry = Object.entries(PREFIX).find(([, p]) => p === prefix);
  return entry ? (entry[0] as ObjectName) : null;
}

/** `YYYY-MM-DD` for `today + offset` days (UTC, so it never shifts by timezone). */
export function dayOffset(today: Date, offset: number): string {
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
}
