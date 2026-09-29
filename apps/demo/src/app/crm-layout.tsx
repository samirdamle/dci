import { DciProvider } from '@dci/react';
import { useMemo, useRef } from 'react';
import { Outlet } from 'react-router';
import { useTheme } from '@/lib/theme-context';
import { CustomChat } from '@/playground/custom-chat';
import { FirstRunHint } from '@/playground/first-run-hint';
import { PlaygroundDrawer } from '@/playground/playground-drawer';
import { settingsToConfig, usePlayground } from '@/playground/settings-context';
import { CrmClientActions } from './client-actions';
import { DCI_CONFIG } from './dci-config';

/**
 * CRM pages share one DCI instance, scoped to the page content (the sidebar
 * and top bar are navigation, not context). Theme and playground settings
 * flow into the config, which the provider applies with `dci.update()`.
 */
export function CrmLayout() {
  const main = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { settings } = usePlayground();
  const config = useMemo(() => {
    const live = settingsToConfig(settings);
    return { ...DCI_CONFIG, ...live, theme, chat: { ...DCI_CONFIG.chat, ...live.chat } };
  }, [theme, settings]);
  return (
    <DciProvider config={config} root={main}>
      <CrmClientActions />
      <div ref={main} className="min-w-0 flex-1 p-6">
        <FirstRunHint />
        <Outlet />
      </div>
      {settings.chatUi === 'custom' && <CustomChat />}
      <PlaygroundDrawer />
    </DciProvider>
  );
}
