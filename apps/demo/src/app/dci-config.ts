import type { ActionsConfig, DciConfig } from '@dci/core';
import { autoTransport } from '@/lib/backend';

const several = (nodes: readonly unknown[]) => nodes.length > 1;

/**
 * Suggested actions per annotation `type` (`'*'` applies everywhere). The ids
 * are what the backends key on (see the mock responder and the Claude agent).
 */
export const ACTIONS: ActionsConfig = {
  opportunity: [
    { id: 'summarize-deal', label: 'Summarize deal' },
    { id: 'next-best-action', label: 'Next best action' },
    { id: 'draft-follow-up', label: 'Draft follow-up email', multi: false },
    { id: 'update-stage', label: 'Update stage', prompt: 'Move this to the next stage' },
  ],
  account: [
    { id: 'account-brief', label: 'Account brief' },
    { id: 'find-risks', label: 'Find risks' },
  ],
  lead: [
    { id: 'qualify-lead', label: 'Qualify this lead' },
    { id: 'draft-outreach', label: 'Draft outreach', multi: false },
  ],
  stage: [{ id: 'why-stuck', label: 'Why are deals stuck here?' }],
  kpi: [{ id: 'why-changed', label: 'Why did this change?' }],
  datapoint: [{ id: 'explain', label: 'Explain this' }],
  campaign: [
    { id: 'analyze-roi', label: 'Analyze ROI' },
    { id: 'suggest-optimizations', label: 'Suggest optimizations' },
    {
      id: 'compare-campaigns',
      label: 'Compare with selected',
      prompt: 'Compare these campaigns and recommend where to shift budget',
      when: several,
    },
  ],
  'email-send': [
    { id: 'why-low-open-rate', label: 'Why is the open rate low?' },
    { id: 'suggest-subject-lines', label: 'Suggest subject lines' },
  ],
  'journey-step': [
    { id: 'explain-step', label: 'Explain this step' },
    { id: 'why-drop-off', label: 'Why the drop-off?' },
  ],
  journey: [{ id: 'journey-performance', label: 'Summarize journey performance' }],
  segment: [{ id: 'describe-audience', label: 'Describe this audience' }],
  '*': [{ id: 'summarize', label: 'Summarize' }],
};

/** The DCI config for the CRM (a stable module constant, so re-renders do no work). */
export const DCI_CONFIG: DciConfig = {
  // The demo server (Claude or mock) when it runs, else the in-browser mock.
  transport: autoTransport,
  actions: ACTIONS,
  // Dragging across table rows should pick the records, not every cell inside them.
  windowSelectLevel: 'top',
  chat: { pushContent: true },
};
