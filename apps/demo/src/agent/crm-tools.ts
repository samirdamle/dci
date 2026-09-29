import { z } from 'zod';
import { objectOf } from '../data/random';
import type { OrgStore } from '../data/store';
import { OPPORTUNITY_STAGES, type OrgObject } from '../data/types';

/**
 * CRM tools shared by the Claude agent and the mock responder, so both write
 * back identically: the server-side store changes, and a `client-action`
 * tells the page to apply the same change to its own store.
 */

export interface ClientAction {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolOutcome {
  ok: boolean;
  /** Returned to the model as the tool result. */
  output: unknown;
  /** Shown in the chat's tool row, e.g. "Updating Opportunity: Alpine Co. – 200 Tents". */
  label: string;
  clientAction?: ClientAction;
}

/** Fields that never leave the store (they are `private` in the UI too). */
const PRIVATE_FIELDS = ['CreditLimit', 'PersonalMobile'];

export function sanitize<T extends object>(record: T): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const f of PRIVATE_FIELDS) delete copy[f];
  return copy as T;
}

/** A record's display name. */
export function recordName(store: OrgStore, id: string): string {
  const found = store.getById(id)?.record as { Name?: string; Subject?: string } | undefined;
  return found?.Name ?? found?.Subject ?? id;
}

const QUERYABLE = [
  'Account',
  'Contact',
  'Opportunity',
  'Lead',
  'Task',
  'Campaign',
  'EmailSend',
  'Segment',
] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const TOOL_SCHEMAS = {
  get_record: z.object({ id: z.string() }),
  query_records: z.object({
    object: z.enum(QUERYABLE),
    filters: z
      .array(
        z.object({
          field: z.string(),
          op: z.enum(['=', '!=', '<', '>', 'contains']),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
        }),
      )
      .optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  update_opportunity: z.object({
    id: z.string(),
    patch: z
      .object({
        StageName: z.enum(OPPORTUNITY_STAGES).optional(),
        Amount: z.number().nonnegative().optional(),
        CloseDate: z.string().regex(ISO_DATE).optional(),
        NextStep: z.string().optional(),
      })
      .strict(),
  }),
  update_lead_status: z.object({
    id: z.string(),
    status: z.enum(['Open', 'Working', 'Qualified', 'Unqualified']),
  }),
  create_task: z.object({
    whatId: z.string(),
    subject: z.string().min(1),
    dueDate: z.string().regex(ISO_DATE),
    type: z.enum(['Call', 'Email', 'Meeting']).optional(),
  }),
  update_campaign: z.object({
    id: z.string(),
    patch: z
      .object({
        Status: z.enum(['Planned', 'In Progress', 'Completed', 'Aborted']).optional(),
        Budget: z.number().nonnegative().optional(),
      })
      .strict(),
  }),
  highlight: z.object({ ids: z.array(z.string()).min(1) }),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export type ToolInput<K extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[K]>;

/** JSON Schemas for the model (hand-written to match the Zod schemas above). */
export const TOOL_DEFINITIONS: Array<{
  name: ToolName;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
}> = [
  {
    name: 'get_record',
    description:
      'Fetch any CRM record by its 18-character Salesforce-style id (the prefix says the object: 001 Account, 003 Contact, 006 Opportunity, 00Q Lead, 00T Task, 701 Campaign, a0S Email send, a0G Segment).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'query_records',
    description:
      "List records of one object with simple field filters, e.g. object 'Opportunity' with filters [{field: 'StageName', op: '=', value: 'Negotiation'}]. Dates are YYYY-MM-DD strings and compare with < and >.",
    input_schema: {
      type: 'object',
      properties: {
        object: { type: 'string', enum: [...QUERYABLE] },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              op: { type: 'string', enum: ['=', '!=', '<', '>', 'contains'] },
              value: { type: ['string', 'number', 'boolean', 'null'] },
            },
            required: ['field', 'op', 'value'],
          },
        },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['object'],
    },
  },
  {
    name: 'update_opportunity',
    description: 'Update an opportunity: StageName, Amount, CloseDate (YYYY-MM-DD) or NextStep.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          properties: {
            StageName: { type: 'string', enum: [...OPPORTUNITY_STAGES] },
            Amount: { type: 'number' },
            CloseDate: { type: 'string', description: 'YYYY-MM-DD' },
            NextStep: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      required: ['id', 'patch'],
    },
  },
  {
    name: 'update_lead_status',
    description: "Change a lead's status.",
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['Open', 'Working', 'Qualified', 'Unqualified'] },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'create_task',
    description: 'Add a follow-up task to a record (usually an opportunity, lead or account).',
    input_schema: {
      type: 'object',
      properties: {
        whatId: { type: 'string', description: 'The related record id' },
        subject: { type: 'string' },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        type: { type: 'string', enum: ['Call', 'Email', 'Meeting'] },
      },
      required: ['whatId', 'subject', 'dueDate'],
    },
  },
  {
    name: 'update_campaign',
    description: "Update a campaign's Status or Budget.",
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          properties: {
            Status: { type: 'string', enum: ['Planned', 'In Progress', 'Completed', 'Aborted'] },
            Budget: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
      required: ['id', 'patch'],
    },
  },
  {
    name: 'highlight',
    description: 'Point the user at records on their screen (pulses them).',
    input_schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids'],
    },
  },
];

/** Drop keys whose value is `undefined` (optional fields the model left out). */
function defined<T extends object>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

const fail = (label: string, message: string): ToolOutcome => ({
  ok: false,
  output: { error: message },
  label,
});

function compare(a: unknown, op: string, b: unknown): boolean {
  switch (op) {
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return (a as number | string) < (b as number | string);
    case '>':
      return (a as number | string) > (b as number | string);
    case 'contains':
      return String(a ?? '')
        .toLowerCase()
        .includes(String(b ?? '').toLowerCase());
    default:
      return false;
  }
}

/** Human label for a tool call, available before it runs. */
export function toolLabel(store: OrgStore, name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const id = typeof i.id === 'string' ? i.id : undefined;
  const object = id ? objectOf(id) : null;
  switch (name) {
    case 'get_record':
      return `Reading ${object ?? 'record'}: ${id ? recordName(store, id) : '…'}`;
    case 'query_records':
      return `Searching ${String(i.object ?? 'records')}`;
    case 'update_opportunity':
      return `Updating Opportunity: ${id ? recordName(store, id) : '…'}`;
    case 'update_lead_status':
      return `Updating Lead: ${id ? recordName(store, id) : '…'}`;
    case 'create_task':
      return `Adding task: ${String(i.subject ?? 'Follow up')}`;
    case 'update_campaign':
      return `Updating Campaign: ${id ? recordName(store, id) : '…'}`;
    case 'highlight':
      return 'Highlighting records';
    default:
      return name;
  }
}

/** Validate and run one tool call against the store. Never throws. */
export function runCrmTool(store: OrgStore, name: string, input: unknown): ToolOutcome {
  const label = toolLabel(store, name, input);
  if (!(name in TOOL_SCHEMAS)) return fail(label, `Unknown tool ${name}`);
  const parsed = TOOL_SCHEMAS[name as ToolName].safeParse(input);
  if (!parsed.success) return fail(label, `Invalid input: ${parsed.error.message}`);
  const args = parsed.data as Record<string, unknown>;

  const missingRecord = (id: string, object: OrgObject) =>
    objectOf(id) === object && store.get(object, id) ? null : `No ${object} with id ${id}`;

  switch (name as ToolName) {
    case 'get_record': {
      const hit = store.getById(String(args.id));
      return hit
        ? { ok: true, output: { object: hit.object, record: sanitize(hit.record) }, label }
        : fail(label, `No record with id ${String(args.id)}`);
    }
    case 'query_records': {
      const { object, filters = [], limit = 20 } = args as ToolInput<'query_records'>;
      const rows = store
        .list(object)
        .filter((r) =>
          filters.every((f) =>
            compare((r as unknown as Record<string, unknown>)[f.field], f.op, f.value),
          ),
        );
      return {
        ok: true,
        output: { total: rows.length, records: rows.slice(0, limit).map(sanitize) },
        label,
      };
    }
    case 'update_opportunity': {
      const { id, patch } = args as ToolInput<'update_opportunity'>;
      const missing = missingRecord(id, 'Opportunity');
      if (missing) return fail(label, missing);
      const record = store.update('Opportunity', id, defined(patch));
      return {
        ok: true,
        output: { updated: record },
        label,
        clientAction: { name: 'updateRecord', args: { id, patch } },
      };
    }
    case 'update_lead_status': {
      const { id, status } = args as ToolInput<'update_lead_status'>;
      const missing = missingRecord(id, 'Lead');
      if (missing) return fail(label, missing);
      const record = store.update('Lead', id, { Status: status });
      return {
        ok: true,
        output: { updated: record },
        label,
        clientAction: { name: 'updateRecord', args: { id, patch: { Status: status } } },
      };
    }
    case 'create_task': {
      const { whatId, subject, dueDate, type = 'Call' } = args as ToolInput<'create_task'>;
      const what = store.getById(whatId);
      if (!what) return fail(label, `No record with id ${whatId}`);
      const owner = (what.record as { OwnerId?: string }).OwnerId ?? store.data().User[1]!.Id;
      const task = store.create('Task', {
        Subject: subject,
        Type: type,
        Status: 'Not Started',
        ActivityDate: dueDate,
        WhatId: whatId,
        WhoId: null,
        OwnerId: owner,
      });
      return {
        ok: true,
        output: { created: task },
        label,
        clientAction: { name: 'createTask', args: { whatId, subject, dueDate, type } },
      };
    }
    case 'update_campaign': {
      const { id, patch } = args as ToolInput<'update_campaign'>;
      const missing = missingRecord(id, 'Campaign');
      if (missing) return fail(label, missing);
      const record = store.update('Campaign', id, defined(patch));
      return {
        ok: true,
        output: { updated: record },
        label,
        clientAction: { name: 'updateRecord', args: { id, patch } },
      };
    }
    case 'highlight': {
      const { ids } = args as ToolInput<'highlight'>;
      return {
        ok: true,
        output: { highlighted: ids.length },
        label,
        clientAction: { name: 'highlight', args: { ids } },
      };
    }
  }
}
