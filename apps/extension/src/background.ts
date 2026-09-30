import type Anthropic from '@anthropic-ai/sdk';
import type { DciRequest } from '@samirdamle/dci-protocol';
import type { History } from './backends/claude';
import { selectBackend, type Backend } from './backends/index';
import { ext } from './ext';
import {
  isStateMessage,
  isTestMessage,
  isToggleMessage,
  PORT_NAME,
  tabStateKey,
  type TabState,
  type TestResult,
} from './messages';
import { capHistory } from './privacy';
import { readSecrets, SECRETS_KEY } from './secrets';
import { originPattern, readSettings, SETTINGS_KEY } from './settings';
import { serve, type WorkerPort } from './worker';

/**
 * The background worker: injects DCI into tabs on request, keeps the badge
 * and the always-on sites in sync, and answers chat requests from content
 * scripts. It is the only place that reads keys and talks to backends.
 */
const api = ext();

/** The file the build emits for `src/content.ts`. */
export const CONTENT_SCRIPT = 'content.js';
const ALWAYS_ON_ID = 'dci-always-on';

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

// E2E builds only: Playwright can't click the toolbar button, so it calls this.
if (__E2E__) Object.assign(globalThis, { dciToggle: toggle });

// The toolbar button opens the popup; the keyboard shortcut toggles directly.
api.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-dci') void toggle(tab?.id);
});

async function setTabState(tabId: number, state: TabState) {
  await Promise.all([
    api.action.setBadgeText({ tabId, text: BADGE[state] }),
    api.storage.session.set({ [tabStateKey(tabId)]: state }),
  ]);
}

// A navigation removes the content script, so the tab is off again.
api.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') void setTabState(tabId, 'off');
});
api.tabs.onRemoved.addListener((tabId) => void api.storage.session.remove(tabStateKey(tabId)));

void api.action.setBadgeBackgroundColor({ color: '#2563eb' });

// ── Chat requests ─────────────────────────────────────────────────────────

/** Conversations for the Claude backend, kept for the browser session. */
const history: History = {
  async get(sessionId) {
    const key = `history:${sessionId}`;
    return ((await api.storage.session.get(key))[key] as Anthropic.Beta.BetaMessageParam[]) ?? [];
  },
  async set(sessionId, messages) {
    // Capped, so a long conversation can't fill the session storage quota.
    await api.storage.session.set({ [`history:${sessionId}`]: capHistory(messages) });
  },
};

async function currentBackend(): Promise<Backend> {
  const stored = await api.storage.local.get([SETTINGS_KEY, SECRETS_KEY]);
  return selectBackend(
    readSettings(stored[SETTINGS_KEY]),
    readSecrets(stored[SECRETS_KEY]),
    history,
  );
}

/** Reads the settings per request, so changes apply without a reload. */
const backend: Backend = async function* (request, signal) {
  yield* (await currentBackend())(request, signal);
};

api.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_NAME) serve(port as unknown as WorkerPort, backend);
});

/** Send one test question through the chosen backend (options page). */
async function test(): Promise<TestResult> {
  const request: DciRequest = {
    v: 1,
    sessionId: `test-${Date.now()}`,
    prompt: 'This is a connection test from the DCI extension. Reply with one short sentence.',
    context: [],
    page: { url: 'about:blank', title: 'DCI connection test' },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let text = '';
  try {
    for await (const event of backend(request, controller.signal)) {
      if (event.type === 'text-delta') text += event.text;
      if (event.type === 'error') return { ok: false, error: event.message };
    }
    return controller.signal.aborted
      ? { ok: false, error: 'No answer within 30 seconds.' }
      : { ok: true, text: text.trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** The popup and the options page, as opposed to content scripts in web pages. */
const fromExtensionPage = (sender: chrome.runtime.MessageSender) =>
  sender.id === api.runtime.id && !!sender.url?.startsWith(api.runtime.getURL(''));

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isStateMessage(message) && sender.tab?.id !== undefined) {
    void setTabState(sender.tab.id, message.state);
  } else if (!fromExtensionPage(sender)) {
    // Toggling other tabs and spending API credits are for the extension's own pages.
    return undefined;
  } else if (isToggleMessage(message)) {
    void toggle(message.tabId).then(() => sendResponse(true));
    return true;
  } else if (isTestMessage(message)) {
    void test().then(sendResponse);
    return true; // Keeps the channel open for the async response.
  }
  return undefined;
});

// ── Always-on sites ───────────────────────────────────────────────────────

/** Register the content script on the always-on sites the user granted. */
async function syncAlwaysOn() {
  const sites = readSettings(
    (await api.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY],
  ).alwaysOnSites;
  const granted: string[] = [];
  for (const site of sites) {
    if (await api.permissions.contains({ origins: [originPattern(site)] })) granted.push(site);
  }
  await api.scripting.unregisterContentScripts({ ids: [ALWAYS_ON_ID] }).catch(() => {});
  if (granted.length) {
    await api.scripting.registerContentScripts([
      {
        id: ALWAYS_ON_ID,
        matches: granted.map(originPattern),
        js: [CONTENT_SCRIPT],
        runAt: 'document_idle',
      },
    ]);
  }
}

api.runtime.onInstalled.addListener(() => void syncAlwaysOn());
api.runtime.onStartup.addListener(() => void syncAlwaysOn());
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && SETTINGS_KEY in changes) void syncAlwaysOn();
});
api.permissions.onRemoved.addListener(() => void syncAlwaysOn());
