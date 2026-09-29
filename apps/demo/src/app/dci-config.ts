import type { ActionsConfig, DciConfig } from '@dci/core';
import { mockTransport } from '@/mock-backend';

/** Suggested actions per annotation `type` (`'*'` applies everywhere). */
export const ACTIONS: ActionsConfig = {
  kpi: [{ id: 'why-changed', label: 'Why did this change?' }],
  datapoint: [{ id: 'explain', label: 'Explain this' }],
  opportunity: [
    { id: 'summarize-deal', label: 'Summarize deal' },
    { id: 'next-best-action', label: 'Next best action', multi: false },
  ],
  task: [{ id: 'summarize', label: 'Summarize' }],
  '*': [{ id: 'summarize', label: 'Summarize' }],
};

/** The DCI config for the CRM (stable module constant: no re-renders do work). */
export const DCI_CONFIG: DciConfig = {
  transport: mockTransport,
  actions: ACTIONS,
  chat: { pushContent: true },
};
