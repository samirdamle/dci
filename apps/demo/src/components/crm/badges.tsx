import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { User } from '@/data';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  good: 'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  bad: 'border-red-600/30 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'border-blue-600/30 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  neutral: '',
};

const TONES: Record<string, keyof typeof TONE> = {
  'Closed Won': 'good',
  'Closed Lost': 'bad',
  Negotiation: 'info',
  Proposal: 'info',
  Healthy: 'good',
  'At Risk': 'warn',
  Critical: 'bad',
  Hot: 'bad',
  Warm: 'warn',
  Cold: 'info',
  Qualified: 'good',
  Unqualified: 'neutral',
  Open: 'info',
  Working: 'warn',
  Running: 'good',
  Paused: 'warn',
  Completed: 'neutral',
  'In Progress': 'info',
  Planned: 'neutral',
  Aborted: 'bad',
};

/** A status pill; purely visual (no annotation), the row or field carries the data. */
export function StatusBadge({ value, tone }: { value: string; tone?: keyof typeof TONE }) {
  return (
    <Badge variant="outline" className={cn('font-normal', TONE[tone ?? TONES[value] ?? 'neutral'])}>
      {value}
    </Badge>
  );
}

/** Owner initials and name; purely visual. */
export function OwnerAvatar({
  user,
  showName = true,
}: {
  user: User | undefined;
  showName?: boolean;
}) {
  if (!user) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar className="size-6">
        <AvatarFallback className="text-[10px] text-foreground">{user.Alias}</AvatarFallback>
      </Avatar>
      {showName && <span className="truncate">{user.Name}</span>}
    </span>
  );
}
