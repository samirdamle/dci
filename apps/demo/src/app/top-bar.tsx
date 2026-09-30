import { CircleHelp, Moon, Search, SlidersHorizontal, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useBackend } from '@/lib/backend';
import { useTheme } from '@/lib/theme-context';
import { usePlayground } from '@/playground/settings-context';
import { APPS } from './nav';

/** Global search (navigation only), org and mode badges, and the theme toggle. */
export function TopBar() {
  const backend = useBackend();
  const playground = usePlayground();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    // A container, so it adapts to its own width (narrower when the chat panel is docked).
    <header className="@container sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Button
        variant="outline"
        size="sm"
        className="max-w-64 min-w-0 flex-1 justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="truncate">Search Summit Gear…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] text-foreground @lg:inline">
          ⌘K
        </kbd>
      </Button>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Badge
          className="hidden @3xl:inline-flex"
          variant="outline"
          title="Summit Gear Co. is made up; not affiliated with Salesforce."
        >
          Fictional demo org
        </Badge>
        {backend && (
          <Badge
            className="hidden @3xl:inline-flex"
            variant={backend.mode === 'claude' ? 'default' : 'secondary'}
            title={
              backend.mode === 'claude'
                ? `Answers come from ${backend.model ?? 'Claude'} via the demo server.`
                : backend.mode === 'mock'
                  ? 'Scripted answers from the demo server (no API key set).'
                  : 'Scripted answers computed in your browser (static demo).'
            }
          >
            {backend.mode === 'claude' ? 'Claude mode' : 'Mock mode'}
          </Badge>
        )}
        <Button
          variant={playground.drawerOpen ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={playground.drawerOpen}
          onClick={() => playground.setDrawerOpen(!playground.drawerOpen)}
        >
          <SlidersHorizontal className="size-4" />
          Playground
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Gestures and keys"
          onClick={() => playground.setCheatSheetOpen(true)}
        >
          <CircleHelp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Go to…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {APPS.map((app) => (
            <CommandGroup key={app.id} heading={app.label}>
              {app.items.map((item) => (
                <CommandItem
                  key={item.to}
                  onSelect={() => {
                    navigate(item.to);
                    setOpen(false);
                  }}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </header>
  );
}
