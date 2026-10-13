import { useChat, useSelection, useSelectMode } from '@samirdamle/dci-react';
import { Check, MessageCircle, SquareDashedMousePointer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';
import { cn } from '@/lib/utils';

export interface SelectModeBarProps {
  /** Pin to the bottom of the screen instead of sitting in the flow. */
  floating?: boolean;
  /** Show it with a mouse too. By default it only shows on touch screens. */
  always?: boolean;
  className?: string;
}

/**
 * The touch-screen way into DCI: Select turns Select mode on, so taps select
 * (and add), a drag draws the selection box and a double tap selects all of a
 * kind; Ask opens the chat. Marked as DCI UI, so its own taps never select anything.
 */
export function SelectModeBar({ floating = false, always = false, className }: SelectModeBarProps) {
  const touch = useCoarsePointer('any');
  const mode = useSelectMode();
  const { elements, clear } = useSelection();
  const chat = useChat();
  if (!touch && !always) return null;
  const count = elements.length;
  return (
    <div
      data-dci-ui=""
      data-testid="select-mode-bar"
      role="toolbar"
      aria-label="Selection"
      className={cn(
        'flex items-center gap-2',
        floating &&
          'fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border bg-background/95 p-1.5 shadow-lg backdrop-blur',
        className,
      )}
    >
      {mode.on ? (
        <>
          <span
            className="px-2 text-sm font-medium whitespace-nowrap tabular-nums"
            aria-live="polite"
          >
            {count ? `${count} selected` : 'Tap to select'}
          </span>
          {count > 0 && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label="Clear selection"
                onClick={clear}
              >
                <X />
              </Button>
              {!chat.open && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => chat.setOpen(true)}
                >
                  <MessageCircle />
                  Ask
                </Button>
              )}
            </>
          )}
          <Button size="sm" className="rounded-full" onClick={() => mode.setOn(false)}>
            <Check />
            Done
          </Button>
        </>
      ) : (
        <Button
          variant={floating ? 'default' : 'outline'}
          size="sm"
          className="rounded-full"
          onClick={() => mode.setOn(true)}
        >
          <SquareDashedMousePointer />
          Select
        </Button>
      )}
    </div>
  );
}
