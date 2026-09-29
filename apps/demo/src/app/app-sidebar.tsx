import { Check, ChevronsUpDown, FlaskConical, Mountain } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { APPS, appFor } from './nav';

/** App switcher (Sales / Marketing Cloud) and the current app's pages. */
export function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const app = appFor(pathname);

  return (
    <Sidebar collapsible="icon" role="navigation" aria-label="Apps and pages">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" aria-label="Switch app">
                  <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Mountain className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">Summit Gear Co.</span>
                    <span className="truncate text-xs text-muted-foreground">{app.label}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Apps</DropdownMenuLabel>
                {APPS.map((a) => (
                  <DropdownMenuItem key={a.id} onSelect={() => navigate(a.items[0]!.to)}>
                    <a.icon className="size-4" />
                    {a.label}
                    {a.id === app.id && <Check className="ml-auto size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{app.label}</SidebarGroupLabel>
          <SidebarMenu>
            {app.items.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={
                    pathname === item.to ||
                    (item.to.split('/').length > 2 && pathname.startsWith(`${item.to}/`))
                  }
                  tooltip={item.label}
                >
                  <NavLink to={item.to}>
                    <item.icon />
                    <span>{item.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === '/classic'}
              tooltip="Classic playground"
            >
              <NavLink to="/classic">
                <FlaskConical />
                <span>Classic playground</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
