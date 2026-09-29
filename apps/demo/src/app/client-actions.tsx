import { useDciAction } from '@dci/react';
import { objectOf, type OrgObject, type Task } from '@/data';
import { orgStore } from '@/lib/org';

const WRITABLE: OrgObject[] = ['Opportunity', 'Lead', 'Campaign', 'Account', 'Task'];

/**
 * Backend write-back. The agent (or mock) changes a record server-side and
 * sends a `client-action`; the store updates, and every view re-renders.
 */
export function CrmClientActions() {
  useDciAction('updateRecord', (args) => {
    const id = String(args.id);
    const object = objectOf(id);
    if (!object || object === 'JourneyStep' || !WRITABLE.includes(object))
      throw new Error(`Cannot update ${id}`);
    orgStore.update(object, id, (args.patch ?? {}) as Record<string, never>);
  });

  useDciAction('createTask', (args) => {
    const what = orgStore.getById(String(args.whatId));
    const owner =
      (what?.record as { OwnerId?: string } | undefined)?.OwnerId ?? orgStore.data().User[1]!.Id;
    const task: Omit<Task, 'Id'> = {
      Subject: String(args.subject ?? 'Follow up'),
      Type: (['Call', 'Email', 'Meeting'] as const).find((t) => t === args.type) ?? 'Call',
      Status: 'Not Started',
      ActivityDate: String(args.dueDate),
      WhatId: String(args.whatId),
      WhoId: null,
      OwnerId: owner,
    };
    orgStore.create('Task', task);
  });

  return null;
}
