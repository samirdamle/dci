import type { ModifierKey } from '@dci/core';
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/lib/theme-context';
import { RequestInspector } from './inspector';
import { usePlayground, type DemoSettings } from './settings-context';

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={htmlFor} className="font-normal">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id} size="sm" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Live `dci.update()` toggles and the request inspector. Non-modal, so you
 * can keep selecting on the page while it is open.
 */
export function PlaygroundDrawer() {
  const { settings, update, drawerOpen, setDrawerOpen } = usePlayground();
  const { theme, setTheme } = useTheme();
  const set =
    <K extends keyof DemoSettings>(key: K) =>
    (value: DemoSettings[K]) =>
      update({ [key]: value } as Partial<DemoSettings>);

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}>
      <SheetContent
        side="left"
        className="w-96 overflow-y-auto sm:max-w-96"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Playground</SheetTitle>
          <SheetDescription>Every change applies immediately via dci.update().</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Chat</h3>
            <Row label="Chat UI" htmlFor="pg-chat-ui">
              <Choice
                id="pg-chat-ui"
                value={settings.chatUi}
                options={[
                  ['default', 'Default DCI UI'],
                  ['custom', 'Custom shadcn chat'],
                ]}
                onChange={set('chatUi')}
              />
            </Row>
            <Row label="Mode" htmlFor="pg-mode">
              <Choice
                id="pg-mode"
                value={settings.chatMode}
                options={[
                  ['popover', 'Popover'],
                  ['panel', 'Panel'],
                ]}
                onChange={set('chatMode')}
              />
            </Row>
            <Row label="Confirm before send" htmlFor="pg-confirm">
              <Switch
                id="pg-confirm"
                checked={settings.confirmBeforeSend}
                onCheckedChange={set('confirmBeforeSend')}
              />
            </Row>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Selection</h3>
            <Row label="Modifier key" htmlFor="pg-modifier">
              <Choice<ModifierKey>
                id="pg-modifier"
                value={settings.modifier}
                options={[
                  ['Alt', 'Alt (⌥)'],
                  ['Control', 'Ctrl'],
                  ['Meta', 'Cmd (⌘)'],
                  ['Shift', 'Shift'],
                ]}
                onChange={set('modifier')}
              />
            </Row>
            <Row label="Max selection" htmlFor="pg-max">
              <Choice
                id="pg-max"
                value={String(settings.maxSelection)}
                options={[
                  ['3', '3'],
                  ['10', '10'],
                  ['50', '50'],
                ]}
                onChange={(v) => update({ maxSelection: Number(v) })}
              />
            </Row>
            <Row label="Unannotated elements (fallback)" htmlFor="pg-fallback">
              <Switch
                id="pg-fallback"
                checked={settings.fallback}
                onCheckedChange={set('fallback')}
              />
            </Row>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Context</h3>
            <Row label="Include ancestors" htmlFor="pg-ancestors">
              <Switch
                id="pg-ancestors"
                checked={settings.includeAncestors}
                onCheckedChange={set('includeAncestors')}
              />
            </Row>
            <Row label="Ancestor data" htmlFor="pg-ancestor-data">
              <Choice
                id="pg-ancestor-data"
                value={settings.ancestorData}
                options={[
                  ['compact', 'Compact'],
                  ['full', 'Full'],
                ]}
                onChange={set('ancestorData')}
              />
            </Row>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Look</h3>
            <Row label="Overlay" htmlFor="pg-overlay">
              <Choice
                id="pg-overlay"
                value={settings.overlayMode}
                options={[
                  ['boxes', 'Boxes'],
                  ['outline', 'Outline'],
                ]}
                onChange={set('overlayMode')}
              />
            </Row>
            <Row label="Dark theme" htmlFor="pg-theme">
              <Switch
                id="pg-theme"
                checked={theme === 'dark'}
                onCheckedChange={(dark) => setTheme(dark ? 'dark' : 'light')}
              />
            </Row>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Request inspector</h3>
            <RequestInspector />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
