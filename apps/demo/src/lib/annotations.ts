import type { Opportunity } from '@/data';

/** How an opportunity is described to the AI, everywhere it appears. */
export function opportunityAnnotation(o: Opportunity, account?: string) {
  return {
    id: o.Id,
    type: 'opportunity',
    label: o.Name,
    account,
    stage: o.StageName,
    amount: o.Amount,
    closeDate: o.CloseDate,
    probability: o.Probability,
    nextStep: o.NextStep,
  };
}
