import { cn } from '@/lib/utils';

/** "Step 2 of 3" with a dot per step: filled when done, ringed when current. */
export function StepProgress({
  current,
  done,
}: {
  current: number;
  /** One entry per step. */
  done: readonly boolean[];
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="flex gap-1.5" aria-hidden>
        {done.map((isDone, i) => (
          <span
            key={i}
            className={cn(
              'size-2 rounded-full bg-muted-foreground/30 transition-colors',
              isDone && 'bg-primary',
              i === current && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
            )}
          />
        ))}
      </div>
      <span>
        Step {current + 1} of {done.length}
      </span>
    </div>
  );
}
