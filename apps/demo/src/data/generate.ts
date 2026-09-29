import { generateMarketing } from './marketing';
import { createRandom } from './random';
import { generateSales } from './sales';
import type { OrgData } from './types';

export const DEFAULT_SEED = 20_260_929;

/**
 * The whole Summit Gear Co. org. The same `seed` and `today` always give the
 * same records; dates are relative to `today` so dashboards look current.
 */
export function generateOrg(today: Date = new Date(), seed = DEFAULT_SEED): OrgData {
  const r = createRandom(seed);
  const marketing = generateMarketing(r, today);
  const sales = generateSales(
    r,
    today,
    marketing.Campaign.map((c) => c.Id),
  );
  return { ...sales, ...marketing };
}
