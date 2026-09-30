import { offlineBackend } from './backends/offline';
import { ext } from './ext';
import { isStateMessage, PORT_NAME, type TabState } from './messages';
import { serve, type WorkerPort } from './worker';

/**
 * The background worker: injects DCI into a tab on request, keeps the toolbar
 * badge in sync, and answers chat requests from content scripts. It is the only
 * place that talks to backends.
 */
const api = ext();

/** The file the build emits for `src/content.ts`. */
export const CONTENT_SCRIPT = 'content.js';

const BADGE: Record<TabState, string> = { on: 'ON', off: '', 'page-has-dci': '—' };

async function toggle(tabId: number | undefined) {
  if (tabId === undefined) return;
  try {
    await api.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
  } catch (err) {
    // Browser pages (chrome://, the stores, about:) don't allow scripts.
    console.warn('DCI: cannot run on this page.', err);
  }
}

api.action.onClicked.addListener((tab) => void toggle(tab.id));

// E2E builds only: Playwright can't click the toolbar button, so it calls this.
if (__E2E__) Object.assign(globalThis, { dciToggle: toggle });
api.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-dci') void toggle(tab?.id);
});

api.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (!isStateMessage(message) || tabId === undefined) return;
  void api.action.setBadgeText({ tabId, text: BADGE[message.state] });
});

// A navigation removes the content script, so the tab is off again.
api.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') void api.action.setBadgeText({ tabId, text: '' });
});

void api.action.setBadgeBackgroundColor({ color: '#2563eb' });

api.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_NAME) serve(port as unknown as WorkerPort, offlineBackend());
});
