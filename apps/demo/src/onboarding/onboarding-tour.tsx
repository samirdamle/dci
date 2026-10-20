import { resolveBindings } from '@samirdamle/dci-core';
import { CircleCheck, MousePointerClick } from 'lucide-react';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { DCI_CONFIG } from '@/app/dci-config';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { keyLabel } from '@/playground/cheat-sheet-rows';
import { usePlayground } from '@/playground/settings-context';
import { KeyCombo } from './key-combo';
import { StepProgress } from './step-progress';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';
import { stepPrompt, TOUR_STEPS, type TourKeys } from './steps';
import { SAMPLE_COUNT, TOUR_CHAT_WIDTH } from './tour-data';
import { TourIntro } from './tour-intro';
import { TourPlayground } from './tour-playground';
import { markTourSeen } from './tour-storage';

interface TourActions {
  onFinish: () => void;
  onShowAll: () => void;
}

/** The open tour: the intro, then the steps. Mounted per opening, so it always starts at the intro. */
function TourFlow(actions: TourActions) {
  const [started, setStarted] = useState(false);
  return started ? (
    <TourBody {...actions} onBackToIntro={() => setStarted(false)} />
  ) : (
    <TourIntro onStart={() => setStarted(true)} onSkip={actions.onFinish} />
  );
}

/** The hands-on steps, from step 1. */
function TourBody({
  onFinish,
  onShowAll,
  onBackToIntro,
}: TourActions & { onBackToIntro: () => void }) {
  const { settings } = usePlayground();
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<readonly boolean[]>(() => TOUR_STEPS.map(() => false));
  const step = TOUR_STEPS[index]!;
  const isLast = index === TOUR_STEPS.length - 1;
  const stepDone = done[index]!;

  const toggle = resolveBindings(DCI_CONFIG.bindings).toggle || 'Shift';
  const keys: TourKeys = { mod: keyLabel(settings.modifier), toggle: keyLabel(toggle) };
  const touch = useCoarsePointer();
  const prompt = stepPrompt(step, keys, touch);

  // Done stays done, even if the selection changes afterwards.
  const onCount = useCallback(
    (count: number) => {
      if (!step.isDone(count, SAMPLE_COUNT)) return;
      setDone((d) => (d[index] ? d : d.map((v, i) => v || i === index)));
    },
    [step, index],
  );

  return (
    <>
      <DialogHeader>
        <StepProgress current={index} done={done} />
        <DialogTitle>{step.title}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
          <KeyCombo keys={prompt.gesture} />
          <span>{prompt.hint}</span>
        </DialogDescription>
      </DialogHeader>

      <TourPlayground
        resetKey={step.resetOnEnter ? step.id : null}
        onCount={onCount}
        selectBar={touch}
      />

      <p
        role="status"
        className="flex min-h-10 items-start gap-2 text-sm"
        data-testid="tour-status"
        data-done={stepDone || undefined}
      >
        {stepDone ? (
          <>
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
            <span>
              {step.success}
              {isLast && (
                <>
                  {' '}
                  You’re set: try it on any record on the page.{' '}
                  <button type="button" className="text-primary underline" onClick={onShowAll}>
                    All gestures
                  </button>
                </>
              )}
            </span>
          </>
        ) : (
          <>
            <MousePointerClick className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>Your turn.</span>
          </>
        )}
      </p>

      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={onFinish}>
          Skip tour
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={index > 0 ? () => setIndex(index - 1) : onBackToIntro}>
            Back
          </Button>
          <Button
            variant={stepDone ? 'default' : 'outline'}
            onClick={isLast ? onFinish : () => setIndex(index + 1)}
          >
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/**
 * A short intro to DCI, then a three-step, hands-on tour of the selection gestures. It is non-modal so
 * the tour's own chat (outside the dialog, in DCI's shadow root) stays
 * usable; a backdrop keeps the page behind out of reach. Closing it in any
 * way remembers it as seen.
 */
export function OnboardingTour() {
  const { tourOpen, setTourOpen, setCheatSheetOpen } = usePlayground();
  const close = () => {
    markTourSeen();
    setTourOpen(false);
  };
  return (
    <Dialog
      open={tourOpen}
      onOpenChange={(open) => (open ? setTourOpen(true) : close())}
      modal={false}
    >
      {tourOpen &&
        createPortal(<div className="fixed inset-0 z-50 bg-black/50" aria-hidden />, document.body)}
      <DialogContent
        // Centred in the space the docked tour chat leaves on wide screens. The
        // foreground-coloured border keeps it distinct from the dimmed page in both themes.
        className="max-w-md border-2 border-foreground lg:left-[calc((100%-var(--tour-chat-width))/2)]"
        style={{ ['--tour-chat-width' as string]: `${TOUR_CHAT_WIDTH}px` }}
        data-testid="tour"
        // Clicks and focus in the tour's chat land outside the dialog: keep it open.
        onInteractOutside={(e) => e.preventDefault()}
        // Esc in the tour's chat or with a selection belongs to DCI first.
        onEscapeKeyDown={(e) => {
          if (e.composedPath().some((n) => n instanceof Element && n.localName === 'dci-root'))
            e.preventDefault();
        }}
      >
        <TourFlow
          onFinish={close}
          onShowAll={() => {
            close();
            setCheatSheetOpen(true);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
