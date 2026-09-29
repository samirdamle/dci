import { objectOf, PREFIX, sfId } from './random';
import type { JourneyStep, Opportunity, OrgData, OrgObject, OrgRecords } from './types';

export interface OrgChange {
  type: 'create' | 'update';
  object: OrgObject;
  id: string;
}

type Filter<T> = Partial<T> | ((record: T) => boolean);

export interface OrgStore {
  /** The current snapshot. Updates replace records (and arrays), never mutate them. */
  data(): OrgData;
  list<K extends OrgObject>(object: K, filter?: Filter<OrgRecords[K]>): OrgRecords[K][];
  get<K extends OrgObject>(object: K, id: string): OrgRecords[K] | undefined;
  /** Any record by id (the key prefix says which object), journey steps included. */
  getById(id: string): { object: OrgObject | 'JourneyStep'; record: object } | undefined;
  /** Patch a record; derived fields are recomputed. Returns the new record. */
  update<K extends OrgObject>(
    object: K,
    id: string,
    patch: Partial<OrgRecords[K]>,
  ): OrgRecords[K] | undefined;
  create<K extends OrgObject>(object: K, record: Omit<OrgRecords[K], 'Id'>): OrgRecords[K];
  subscribe(fn: (change: OrgChange) => void): () => void;
}

const STAGE_PROBABILITY: Record<string, number> = {
  Prospecting: 10,
  Qualification: 20,
  'Needs Analysis': 40,
  Proposal: 60,
  Negotiation: 80,
  'Closed Won': 100,
  'Closed Lost': 0,
};

function matches<T>(record: T, filter?: Filter<T>): boolean {
  if (!filter) return true;
  if (typeof filter === 'function') return filter(record);
  return Object.entries(filter).every(([k, v]) => record[k as keyof T] === v);
}

function findStep(steps: JourneyStep[], id: string): JourneyStep | undefined {
  for (const s of steps) {
    if (s.Id === id) return s;
    for (const b of s.Branches ?? []) {
      const hit = findStep(b.Steps, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Recompute fields that depend on others. */
function derive<K extends OrgObject>(object: K, record: OrgRecords[K]): OrgRecords[K] {
  if (object === 'Opportunity') {
    const o = record as Opportunity;
    return { ...o, Probability: STAGE_PROBABILITY[o.StageName] ?? o.Probability } as OrgRecords[K];
  }
  if (object === 'Campaign') {
    const c = record as OrgRecords['Campaign'];
    return {
      ...c,
      ROI: c.ActualCost ? Math.round(((c.WonAmount - c.ActualCost) / c.ActualCost) * 100) / 100 : 0,
    } as OrgRecords[K];
  }
  return record;
}

/** A small in-memory store over the org, shared by the UI and the mock/Claude backends. */
export function createOrgStore(initial: OrgData): OrgStore {
  let data = initial;
  const listeners = new Set<(change: OrgChange) => void>();
  const counters = new Map<OrgObject, number>();
  const emit = (change: OrgChange) => {
    for (const fn of [...listeners]) fn(change);
  };

  return {
    data: () => data,
    list: (object, filter) =>
      (data[object] as OrgRecords[typeof object][]).filter((r) => matches(r, filter)),
    get: (object, id) =>
      (data[object] as Array<OrgRecords[typeof object]>).find((r) => r.Id === id),
    getById(id) {
      const object = objectOf(id);
      if (!object) return undefined;
      if (object === 'JourneyStep') {
        for (const j of data.Journey) {
          const record = findStep(j.Steps, id);
          if (record) return { object, record };
        }
        return undefined;
      }
      const record = (data[object] as Array<{ Id: string }>).find((r) => r.Id === id);
      return record ? { object, record } : undefined;
    },
    update(object, id, patch) {
      const list = data[object] as Array<OrgRecords[typeof object]>;
      const i = list.findIndex((r) => r.Id === id);
      if (i < 0) return undefined;
      const next = derive(object, { ...list[i]!, ...patch, Id: id });
      data = { ...data, [object]: list.map((r, j) => (j === i ? next : r)) };
      emit({ type: 'update', object, id });
      return next;
    },
    create(object, record) {
      const list = data[object] as Array<OrgRecords[typeof object]>;
      const n = (counters.get(object) ?? list.length) + 1;
      counters.set(object, n);
      const Id = sfId(PREFIX[object], 900_000 + n);
      const created = derive(object, { ...record, Id } as OrgRecords[typeof object]);
      data = { ...data, [object]: [...list, created] };
      emit({ type: 'create', object, id: Id });
      return created;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
