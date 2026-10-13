import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { INTRO_SECTIONS } from './intro';

/** The tour's opening screen: a short why, before the hands-on steps. */
export function TourIntro({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Point, don’t describe</DialogTitle>
        <DialogDescription>DCI in three short ideas.</DialogDescription>
      </DialogHeader>
      <ul className="grid gap-4" data-testid="tour-intro">
        {INTRO_SECTIONS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Skip tour
        </Button>
        <Button onClick={onStart}>
          Show me how <ArrowRight aria-hidden />
        </Button>
      </DialogFooter>
    </>
  );
}
