import { Moon, Search, Sun } from 'lucide-react';
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
import { APPS } from './nav';

/** Global search (navigation only), org and mode badges, and the theme toggle. */
export function TopBar() {
  const backend = useBackend();
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
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Button
        variant="outline"
        size="sm"
        className="w-64 justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        Search Summit Gear…
        <kbd className="ml-auto rounded border bg-muted px-1.5 text-[10px] text-foreground">⌘K</kbd>
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <Badge
          variant="outline"
          title="Summit Gear Co. is made up; not affiliated with Salesforce."
        >
          Fictional demo org
        </Badge>
        {backend && (
          <Badge
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
