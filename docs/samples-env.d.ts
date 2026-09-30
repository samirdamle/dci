/**
 * Placeholders that doc samples refer to without defining, so each sample
 * can stay short. Only for type-checking the docs (scripts/check-doc-samples.mjs).
 */
interface Invoice {
  id: string;
  number: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  amount: number;
  customer: string;
}

declare const token: string;
declare const invoices: Invoice[];
declare const store: {
  update(id: string, patch: Record<string, unknown>): void;
  markPaid(id: string): void;
};
