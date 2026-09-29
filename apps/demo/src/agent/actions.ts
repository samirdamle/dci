/**
 * What each suggested-action id asks for. The Claude agent adds the matching
 * instruction to the turn; the mock responder switches on the id directly.
 */
export const ACTION_INSTRUCTIONS: Record<string, string> = {
  summarize: 'Summarize the selected records in a few bullet points.',
  'summarize-deal': 'Summarize each selected deal: stage, amount, timing, risks.',
  'next-best-action':
    'Recommend the single best next action for each selected deal, based on its stage, dates and next step.',
  'draft-follow-up':
    "Draft a concise follow-up email to the deal's primary contact. Do not send anything.",
  'update-stage': 'Move each selected opportunity to its next stage using the tools.',
  'account-brief':
    'Write a short account brief: who they are, open deals, health, recent activity.',
  'find-risks':
    'List the concrete risks for this account (stalled deals, lost deals, quiet periods).',
  'qualify-lead': 'Assess whether this lead is qualified (BANT-style) and say what to do next.',
  'draft-outreach':
    'Draft a short, friendly first outreach email to this lead. Do not send anything.',
  'why-stuck':
    'Explain why deals in this stage are stuck, citing overdue close dates and next steps.',
  'why-changed': 'Explain what likely drove this metric, using the underlying records.',
  explain: 'Explain what this data point means and what drives it.',
  'analyze-roi':
    'Analyze the ROI and cost per lead of the selected campaigns versus the org average.',
  'suggest-optimizations': 'Suggest specific optimizations for the selected campaigns.',
  'compare-campaigns':
    'Compare the selected campaigns (cost per lead, ROI) and recommend where to shift budget.',
  'why-low-open-rate': 'Explain why this email send has a low open rate and how to fix it.',
  'suggest-subject-lines': 'Suggest five better subject lines for this send.',
  'explain-step': 'Explain what this journey step does and how it performs.',
  'why-drop-off':
    'Explain the likely causes of the drop-off at this journey step and how to reduce it.',
  'journey-performance':
    'Summarize how this journey performs step by step, and where it loses people.',
  'describe-audience': 'Describe who is in this audience segment and how to market to them.',
};
