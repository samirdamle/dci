import { useSyncExternalStore } from 'react';
import { createOrgStore, dayOffset, generateOrg, type OrgData } from '@/data';

/** The demo org, generated once per page load (dates relative to today). */
export const orgStore = createOrgStore(generateOrg());

const subscribe = (fn: () => void) => orgStore.subscribe(fn);

/** The live org data; re-renders when a client action changes a record. */
export function useOrg(): OrgData {
  return useSyncExternalStore(subscribe, orgStore.data, orgStore.data);
}

export const today = () => dayOffset(new Date(), 0);

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const money = (n: number) => usd.format(n);
export const moneyShort = (n: number) => compact.format(n);
export const percent = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
export const count = (n: number) => n.toLocaleString('en-US');

/** `2026-10-08` → `Oct 8, 2026`. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
