import {
  Briefcase,
  Building2,
  Columns3,
  Home,
  Mail,
  Megaphone,
  Route,
  Target,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

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
    items: [
      { label: 'Home', to: '/sales', icon: Home },
      { label: 'Opportunities', to: '/sales/opportunities', icon: Target },
      { label: 'Pipeline', to: '/sales/pipeline', icon: Columns3 },
      { label: 'Accounts', to: '/sales/accounts', icon: Building2 },
      { label: 'Leads', to: '/sales/leads', icon: UserPlus },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing Cloud',
    icon: Megaphone,
    items: [
      { label: 'Home', to: '/marketing', icon: Home },
      { label: 'Campaigns', to: '/marketing/campaigns', icon: Megaphone },
      { label: 'Email sends', to: '/marketing/emails', icon: Mail },
      { label: 'Journeys', to: '/marketing/journeys', icon: Route },
      { label: 'Segments', to: '/marketing/segments', icon: Users },
    ],
  },
];

export const appFor = (path: string): CrmApp =>
  APPS.find((a) => path.startsWith(`/${a.id}`)) ?? APPS[0]!;
