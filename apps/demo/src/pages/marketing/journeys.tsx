import { dci } from '@dci/react';
import { Clock, DoorOpen, GitFork, LogIn, Mail, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, StatusBadge } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { JourneyStep } from '@/data';
import { journeyAnnotation, journeyStepAnnotation } from '@/lib/annotations';
import { count, percent, useOrg } from '@/lib/org';
import { cn } from '@/lib/utils';

const ICON: Record<JourneyStep['Kind'], LucideIcon> = {
  Entry: LogIn,
  Email: Mail,
  Wait: Clock,
  Decision: GitFork,
  Exit: DoorOpen,
};

/** A connector line between steps. */
const Connector = () => <div aria-hidden className="mx-auto h-5 w-px bg-border" />;

/** A step node; decision nodes contain their branches (journey › step › branch › step). */
function StepNode({ step }: { step: JourneyStep }) {
  const Icon = ICON[step.Kind];
  const exit = step.Kind === 'Exit';
  const high = !exit && step.DropOff >= 0.5;
  return (
    <div className="flex flex-col items-center" {...dci(journeyStepAnnotation(step))}>
      <div
        className={cn(
          'w-64 rounded-lg border bg-card p-3 text-sm shadow-xs',
          high && 'border-red-600/60 ring-1 ring-red-600/30',
        )}
      >
        <div className="flex items-center gap-2 font-medium">
          <Icon className="size-4 text-primary" />
          {step.Name}
        </div>
        {step.Kind !== 'Entry' && step.Kind !== 'Wait' && step.Entered > 0 && (
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{count(step.Entered)} entered</span>
            <span className={high ? 'font-medium text-red-700 dark:text-red-400' : ''}>
              {exit ? 'end of journey' : `${percent(step.DropOff)} drop-off`}
            </span>
          </div>
        )}
      </div>
      {step.Branches && (
        <>
          <Connector />
          <div className="flex items-start gap-6">
            {step.Branches.map((branch) => (
              <div
                key={branch.Label}
                className="flex flex-col items-center rounded-xl border border-dashed p-3"
                {...dci({
                  id: `${step.Id}.${branch.Label}`,
                  type: 'journey-branch',
                  label: `${step.Name} → ${branch.Label}`,
                  entered: branch.Steps[0]?.Entered ?? 0,
                })}
              >
                <div className="mb-2 rounded-full bg-muted px-2 text-xs font-medium">
                  {branch.Label}
                </div>
                <StepList steps={branch.Steps} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StepList({ steps }: { steps: JourneyStep[] }) {
  return (
    <div className="flex flex-col items-center">
      {steps.map((s, i) => (
        <div key={s.Id} className="flex flex-col items-center">
          {i > 0 && <Connector />}
          <StepNode step={s} />
        </div>
      ))}
    </div>
  );
}

/** Journey Builder-style canvas: the best place to try ↑/↓ through a nested flow. */
export function JourneysPage() {
  const org = useOrg();
  const [selectedId, setSelectedId] = useState(org.Journey[0]?.Id);
  const journey = org.Journey.find((j) => j.Id === selectedId) ?? org.Journey[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journeys"
        hint={
          <>
            Select a step, then <kbd>↑</kbd>/<kbd>↓</kbd> to move between a branch, its decision and
            the journey.
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2" role="group" aria-label="Journey">
            {org.Journey.map((j) => (
              <Button
                key={j.Id}
                size="sm"
                variant={j.Id === journey?.Id ? 'default' : 'outline'}
                aria-pressed={j.Id === journey?.Id}
                onClick={() => setSelectedId(j.Id)}
              >
                {j.Name}
              </Button>
            ))}
          </div>
        }
      />
      {journey && (
        <Card {...dci(journeyAnnotation(journey))}>
          <CardHeader>
            <CardDescription>
              Entry: {journey.EntrySource} · <StatusBadge value={journey.Status} />
            </CardDescription>
            <CardTitle>{journey.Name}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto pb-6">
            <StepList steps={journey.Steps} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
