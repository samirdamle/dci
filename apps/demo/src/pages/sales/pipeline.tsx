import { KanbanBoard, OwnerAvatar, PageHeader } from '@/components/crm';
import { OPPORTUNITY_STAGES, type Opportunity } from '@/data';
import { opportunityAnnotation, stageAnnotation } from '@/lib/annotations';
import { useLookups } from '@/lib/lookups';
import { formatDate, money, moneyShort, today, useOrg } from '@/lib/org';

/** Opportunities by stage: ←/→ between deals, ↑ to the stage, Alt+Double-click for all deals. */
export function PipelinePage() {
  const org = useOrg();
  const lookup = useLookups(org);
  const now = today();
  const stages = OPPORTUNITY_STAGES.filter((s) => s !== 'Closed Lost');
  const columns = stages.map((stage) => {
    const items = org.Opportunity.filter((o) => o.StageName === stage);
    // KanbanColumn sets `type: 'stage'` itself; pass the rest as column data.
    const { id, label, deals, total, overdue } = stageAnnotation(stage, items, now);
    const data = { deals, total, overdue };
    return {
      id,
      label,
      items,
      data,
      footer: (
        <div className="px-1 text-xs text-muted-foreground">{moneyShort(data.total)} total</div>
      ),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        hint={
          <>
            Select a deal, then use <kbd>←</kbd>/<kbd>→</kbd> for neighbours and <kbd>↑</kbd> for
            its stage. <kbd>Alt</kbd>+double-click selects every deal in that stage.
          </>
        }
      />
      <KanbanBoard<Opportunity>
        id="pipeline-board"
        label="Opportunity pipeline"
        columns={columns}
        annotateCard={(o) => opportunityAnnotation(o, lookup.accountName(o.AccountId))}
        renderCard={(o) => (
          <>
            <div className="font-medium leading-snug">{o.Name}</div>
            <div className="text-xs text-muted-foreground">{lookup.accountName(o.AccountId)}</div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="font-medium tabular-nums">{money(o.Amount)}</span>
              <span
                className={
                  o.CloseDate < now && !o.StageName.startsWith('Closed')
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-muted-foreground'
                }
              >
                {formatDate(o.CloseDate)}
              </span>
            </div>
            <OwnerAvatar user={lookup.user(o.OwnerId)} />
          </>
        )}
      />
    </div>
  );
}
