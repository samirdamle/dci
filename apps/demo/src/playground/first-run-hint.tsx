import { MousePointerClick, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { keyLabel } from './cheat-sheet-rows';
import { usePlayground } from './settings-context';

const KEY = 'dci-demo-hint-dismissed';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** A one-time "how to start" hint, remembered once dismissed. */
export function FirstRunHint() {
  const { settings, setCheatSheetOpen } = usePlayground();
  const [hidden, setHidden] = useState(dismissedBefore);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Not remembered; it only reappears on the next visit.
    }
  };
  return (
    <div
      role="note"
      data-dci-ui=""
      className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm"
    >
      <MousePointerClick className="size-4 shrink-0 text-primary" />
      <p className="flex-1">
        Hold <kbd className="rounded border bg-background px-1">{keyLabel(settings.modifier)}</kbd>{' '}
        and click any record, tile or chart bar, then ask about it.{' '}
        <button
          type="button"
          className="text-primary underline"
          onClick={() => setCheatSheetOpen(true)}
        >
          All gestures
        </button>
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Dismiss hint"
        onClick={dismiss}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
