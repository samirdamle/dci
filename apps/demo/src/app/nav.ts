import { Briefcase, Home, Megaphone, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface CrmApp {
  id: 'sales' | 'marketing';
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

/** The two CRM apps and their pages. */
export const APPS: CrmApp[] = [
  {
    id: 'sales',
    label: 'Sales Cloud',
    icon: Briefcase,
    items: [{ label: 'Home', to: '/sales', icon: Home }],
  },
  {
    id: 'marketing',
    label: 'Marketing Cloud',
    icon: Megaphone,
    items: [{ label: 'Home', to: '/marketing', icon: Home }],
  },
];

export const appFor = (path: string): CrmApp =>
  APPS.find((a) => path.startsWith(`/${a.id}`)) ?? APPS[0]!;
