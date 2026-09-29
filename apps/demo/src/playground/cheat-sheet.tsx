import { resolveBindings } from '@dci/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DCI_CONFIG } from '@/app/dci-config';
import { cheatSheetRows } from './cheat-sheet-rows';
import { usePlayground } from './settings-context';

/** `?` in the top bar: every gesture and key, as currently configured. */
export function CheatSheet() {
  const { settings, cheatSheetOpen, setCheatSheetOpen } = usePlayground();
  const rows = cheatSheetRows(resolveBindings(DCI_CONFIG.bindings), settings.modifier);
  return (
    <Dialog open={cheatSheetOpen} onOpenChange={setCheatSheetOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestures and keys</DialogTitle>
          <DialogDescription>
            Point at anything on the page to make it the AI’s context. Keys follow the playground
            settings.
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y text-sm">
          {rows.map(([keys, action]) => (
            <div key={keys} className="flex justify-between gap-4 py-1.5">
              <dt>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">{keys}</kbd>
              </dt>
              <dd className="text-right text-muted-foreground">{action}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
