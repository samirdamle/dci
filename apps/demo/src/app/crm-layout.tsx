import { DciProvider } from '@dci/react';
import { useMemo, useRef } from 'react';
import { Outlet } from 'react-router';
import { useTheme } from '@/lib/theme-context';
import { DCI_CONFIG } from './dci-config';

/**
 * CRM pages share one DCI instance, scoped to the page content (the sidebar
 * and top bar are navigation, not context). The DCI theme follows the app's.
 */
export function CrmLayout() {
  const main = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const config = useMemo(() => ({ ...DCI_CONFIG, theme }), [theme]);
  return (
    <DciProvider config={config} root={main}>
      <div ref={main} className="flex-1 p-6">
        <Outlet />
      </div>
    </DciProvider>
  );
}
