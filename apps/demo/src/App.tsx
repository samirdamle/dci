import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme';
import { AppSidebar } from './app/app-sidebar';
import { CrmLayout } from './app/crm-layout';
import { TopBar } from './app/top-bar';
import { ClassicPage } from './pages/classic';
import { MarketingHome } from './pages/marketing-home';
import { SalesHome } from './pages/sales-home';

/**
 * Summit Gear Co., a fictional CRM org. Hash routing keeps deep links working
 * on GitHub Pages without server rewrites.
 */
export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <HashRouter>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <TopBar mode="mock" />
              <Routes>
                <Route element={<CrmLayout />}>
                  <Route path="/sales" element={<SalesHome />} />
                  <Route path="/marketing" element={<MarketingHome />} />
                </Route>
                <Route path="/classic" element={<ClassicPage />} />
                <Route path="*" element={<Navigate to="/sales" replace />} />
              </Routes>
            </SidebarInset>
          </SidebarProvider>
        </HashRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}
