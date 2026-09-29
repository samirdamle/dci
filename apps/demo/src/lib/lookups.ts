import { useMemo } from 'react';
import type { OrgData } from '@/data';

/** Id → name maps for rendering lookups, rebuilt only when the lists change. */
export function useLookups(org: OrgData) {
  const accounts = useMemo(() => new Map(org.Account.map((a) => [a.Id, a])), [org.Account]);
  const users = useMemo(() => new Map(org.User.map((u) => [u.Id, u])), [org.User]);
  const campaigns = useMemo(() => new Map(org.Campaign.map((c) => [c.Id, c])), [org.Campaign]);
  return {
    account: (id: string) => accounts.get(id),
    accountName: (id: string) => accounts.get(id)?.Name,
    user: (id: string) => users.get(id),
    userName: (id: string) => users.get(id)?.Name,
    campaign: (id: string | null) => (id ? campaigns.get(id) : undefined),
    campaignName: (id: string | null) => (id ? campaigns.get(id)?.Name : undefined),
  };
}
