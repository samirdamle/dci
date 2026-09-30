import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme';
import { CheatSheet } from '@/playground/cheat-sheet';
import { PlaygroundProvider } from '@/playground/settings';
import { AppSidebar } from './app/app-sidebar';
import { CrmLayout } from './app/crm-layout';
import { TopBar } from './app/top-bar';
import { ClassicPage } from './pages/classic';
import { CampaignsPage } from './pages/marketing/campaigns';
import { EmailSendsPage } from './pages/marketing/email-sends';
import { JourneysPage } from './pages/marketing/journeys';
import { SegmentsPage } from './pages/marketing/segments';
import { MarketingHome } from './pages/marketing-home';
import { AccountRecordPage } from './pages/sales/account-record';
import { AccountsPage } from './pages/sales/accounts';
import { LeadsPage } from './pages/sales/leads';
import { OpportunitiesPage } from './pages/sales/opportunities';
import { PipelinePage } from './pages/sales/pipeline';
import { SalesHome } from './pages/sales-home';

/**
 * Summit Gear Co., a fictional CRM org. Hash routing keeps deep links working
 * on GitHub Pages without server rewrites.
 */
export function App() {
  return (
    <ThemeProvider>
      <PlaygroundProvider>
        <TooltipProvider>
          <HashRouter>
            <SidebarProvider>
              <AppSidebar />
              {/* min-w-0: wide tables scroll inside their card instead of widening the page. */}
              <SidebarInset className="min-w-0">
                <TopBar />
                <Routes>
                  <Route element={<CrmLayout />}>
                    <Route path="/sales" element={<SalesHome />} />
                    <Route path="/sales/opportunities" element={<OpportunitiesPage />} />
                    <Route path="/sales/pipeline" element={<PipelinePage />} />
                    <Route path="/sales/accounts" element={<AccountsPage />} />
                    <Route path="/sales/accounts/:id" element={<AccountRecordPage />} />
                    <Route path="/sales/leads" element={<LeadsPage />} />
                    <Route path="/marketing" element={<MarketingHome />} />
                    <Route path="/marketing/campaigns" element={<CampaignsPage />} />
                    <Route path="/marketing/emails" element={<EmailSendsPage />} />
                    <Route path="/marketing/journeys" element={<JourneysPage />} />
                    <Route path="/marketing/segments" element={<SegmentsPage />} />
                  </Route>
                  <Route path="/classic" element={<ClassicPage />} />
                  <Route path="*" element={<Navigate to="/sales" replace />} />
                </Routes>
              </SidebarInset>
            </SidebarProvider>
          </HashRouter>
          <CheatSheet />
        </TooltipProvider>
      </PlaygroundProvider>
    </ThemeProvider>
  );
}
