import { ext } from './ext';
import { tabStateKey, type TabState, type ToggleMessage } from './messages';
import { originPattern, type BackendKind, type Settings } from './settings';
import { loadSettings, saveSettings } from './store';

/** The toolbar popup: DCI on or off for this tab, always-on for this site. */
const api = ext();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const MODIFIER_LABEL: Record<Settings['modifier'], string> = {
  Alt: navigator.platform.startsWith('Mac') ? 'Option' : 'Alt',
  Control: 'Ctrl',
  Meta: navigator.platform.startsWith('Mac') ? 'Cmd' : 'Meta',
  Shift: 'Shift',
};

function backendLabel(settings: Settings): string {
  const labels: Record<BackendKind, () => string> = {
    offline: () => 'Answers: offline placeholder',
    claude: () => `Answers: Claude (${settings.claudeModel})`,
    endpoint: () => {
      try {
        return `Answers: ${new URL(settings.endpointUrl).host}`;
      } catch {
        return 'Answers: your endpoint (not set)';
      }
    },
  };
  return labels[settings.backend]();
}

const STATUS: Record<TabState, string> = {
  on: 'DCI is on for this tab.',
  off: 'DCI is off for this tab.',
  'page-has-dci': 'This page has DCI built in, so the extension stays out of its way.',
};

async function main() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const settings = await loadSettings();
  $('backend').textContent = backendLabel(settings);
  $('modifier').textContent = MODIFIER_LABEL[settings.modifier];
  $('options').addEventListener('click', (e) => {
    e.preventDefault();
    void api.runtime.openOptionsPage();
    window.close();
  });

  const url = tab?.url ? new URL(tab.url) : null;
  if (tab?.id === undefined || !url || !/^https?:$/.test(url.protocol)) {
    $('status').textContent =
      'DCI can’t run on this page (browser and store pages are off limits).';
    $('hint').hidden = true;
    return;
  }
  const tabId = tab.id;
  const key = tabStateKey(tabId);
  const state = ((await api.storage.session.get(key))[key] as TabState | undefined) ?? 'off';
  $('status').textContent = STATUS[state];

  const toggle = $<HTMLButtonElement>('toggle');
  toggle.hidden = state === 'page-has-dci';
  toggle.textContent = state === 'on' ? 'Turn off for this tab' : 'Turn on for this tab';
  toggle.addEventListener('click', async () => {
    const message: ToggleMessage = { type: 'dci:toggle', tabId };
    await api.runtime.sendMessage(message);
    window.close();
  });

  const origin = url.origin;
  const always = $<HTMLInputElement>('always');
  $('site').textContent = url.host;
  $('always-row').hidden = state === 'page-has-dci';
  always.checked = settings.alwaysOnSites.includes(origin);
  always.addEventListener('change', async () => {
    const pattern = originPattern(origin);
    if (always.checked) {
      // Must be the first call in the click handler: it needs the user gesture.
      const granted = await api.permissions.request({ origins: [pattern] });
      if (!granted) {
        always.checked = false;
        return;
      }
      const { alwaysOnSites } = await loadSettings();
      await saveSettings({ alwaysOnSites: [...new Set([...alwaysOnSites, origin])] });
      if (state !== 'on') await api.runtime.sendMessage({ type: 'dci:toggle', tabId });
    } else {
      const { alwaysOnSites } = await loadSettings();
      await saveSettings({ alwaysOnSites: alwaysOnSites.filter((s) => s !== origin) });
      await api.permissions.remove({ origins: [pattern] });
    }
  });
}

void main();
