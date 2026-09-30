import { ext } from './ext';
import type { TestMessage, TestResult } from './messages';
import { isSecureEndpoint } from './privacy';
import { CLAUDE_MODELS, originPattern, type BackendKind, type Settings } from './settings';
import { loadSecrets, loadSettings, saveSecrets, saveSettings } from './store';

/** The options page: backend, keys, selection and chat preferences, always-on sites. */
const api = ext();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);
const form = $<HTMLFormElement>('form');
const result = $('result');

function show(text: string, kind: 'ok' | 'error' | '' = '') {
  result.textContent = text;
  result.className = kind;
}

const backendChoice = () =>
  (form.querySelector<HTMLInputElement>('input[name="backend"]:checked')?.value ??
    'offline') as BackendKind;

function showBackendFields() {
  const backend = backendChoice();
  $('claude-fields').hidden = backend !== 'claude';
  $('endpoint-fields').hidden = backend !== 'endpoint';
  $('test').hidden = false;
}

function renderSites(sites: string[]) {
  const list = $('sites');
  list.replaceChildren(
    ...sites.map((site) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = site;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${site}`);
      remove.addEventListener('click', async () => {
        const settings = await loadSettings();
        const next = settings.alwaysOnSites.filter((s) => s !== site);
        await saveSettings({ alwaysOnSites: next });
        await api.permissions.remove({ origins: [originPattern(site)] });
        renderSites(next);
      });
      item.append(name, remove);
      return item;
    }),
  );
  $('no-sites').hidden = sites.length > 0;
}

async function load() {
  const [settings, secrets] = await Promise.all([loadSettings(), loadSecrets()]);
  const model = select('model');
  const models = new Set<string>([...CLAUDE_MODELS, settings.claudeModel]);
  model.replaceChildren(...[...models].map((m) => new Option(m, m)));
  model.value = settings.claudeModel;
  form.querySelector<HTMLInputElement>(
    `input[name="backend"][value="${settings.backend}"]`,
  )!.checked = true;
  input('apiKey').value = secrets.anthropicApiKey;
  input('endpointUrl').value = settings.endpointUrl;
  input('endpointAuthorization').value = secrets.endpointAuthorization;
  select('modifier').value = settings.modifier;
  select('chatMode').value = settings.chatMode;
  select('chatSide').value = settings.chatSide;
  input('maxSelection').value = String(settings.maxSelection);
  showBackendFields();
  renderSites(settings.alwaysOnSites);
}

/** Validate and save; returns false (with a message) when something is off. */
async function save(): Promise<boolean> {
  const backend = backendChoice();
  const endpointUrl = input('endpointUrl').value.trim();
  const apiKey = input('apiKey').value.trim();

  if (backend === 'endpoint') {
    let url: URL;
    try {
      url = new URL(endpointUrl);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      show('Enter the endpoint’s full http(s) URL.', 'error');
      return false;
    }
    if (input('endpointAuthorization').value.trim() && !isSecureEndpoint(url)) {
      show(
        'Use an https URL to send an Authorization header (http is fine for localhost).',
        'error',
      );
      return false;
    }
    // Needs the user gesture, so it comes before any other await.
    const granted = await api.permissions.request({ origins: [originPattern(url.origin)] });
    if (!granted) {
      show(`The extension needs access to ${url.host} to reach your endpoint.`, 'error');
      return false;
    }
  }
  if (backend === 'claude' && !apiKey) {
    show('Enter your Anthropic API key.', 'error');
    return false;
  }

  const maxSelection = Number(input('maxSelection').value);
  const patch: Partial<Settings> = {
    backend,
    endpointUrl,
    claudeModel: select('model').value,
    modifier: select('modifier').value as Settings['modifier'],
    chatMode: select('chatMode').value as Settings['chatMode'],
    chatSide: select('chatSide').value as Settings['chatSide'],
    maxSelection: Number.isInteger(maxSelection) && maxSelection > 0 ? maxSelection : 50,
  };
  await Promise.all([
    saveSettings(patch),
    saveSecrets({
      anthropicApiKey: apiKey,
      endpointAuthorization: input('endpointAuthorization').value.trim(),
    }),
  ]);
  return true;
}

form.addEventListener('change', (e) => {
  if ((e.target as HTMLInputElement).name === 'backend') showBackendFields();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (await save()) show('Saved.', 'ok');
});

$('test').addEventListener('click', async () => {
  if (!(await save())) return;
  show('Testing…');
  const message: TestMessage = { type: 'dci:test' };
  const reply = (await api.runtime.sendMessage(message)) as TestResult;
  if (reply.ok) show(`Connected. Reply: “${reply.text.slice(0, 120)}”`, 'ok');
  else show(reply.error, 'error');
});

void load();
