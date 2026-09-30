import { createDci, HOST_TAG, type DciInstance } from '@samirdamle/dci-core';
import { ext } from './ext';
import { inferAnnotation } from './infer';
import type { StateMessage, TabState } from './messages';
import { readSettings, SETTINGS_KEY, settingsToConfig } from './settings';
import { portTransport } from './transport';

/**
 * Injected by the toolbar button, the keyboard shortcut or an always-on site.
 * Each injection toggles DCI in this tab: the first starts it, the next stops
 * it. Globals persist between injections in the extension's isolated world.
 */
interface Running {
  dci: DciInstance;
  stop(): void;
}

const g = globalThis as { __dciExtension?: Running };

function report(state: TabState) {
  const message: StateMessage = { type: 'dci:state', state };
  ext()
    .runtime.sendMessage(message)
    .catch(() => {}); // The worker may be restarting; the badge is best effort.
}

async function start() {
  // A page that integrates DCI itself keeps its own; two would fight over Alt.
  if (document.querySelector(HOST_TAG)) return report('page-has-dci');

  const api = ext();
  const settings = readSettings((await api.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
  if (g.__dciExtension) return; // Started twice in a row (e.g. two quick clicks).
  const dci = createDci({
    transport: portTransport(),
    // Most pages have no DCI annotations; infer structure from the markup.
    infer: inferAnnotation,
    ...settingsToConfig(settings),
  });

  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && SETTINGS_KEY in changes) {
      dci.update(settingsToConfig(readSettings(changes[SETTINGS_KEY]!.newValue)));
    }
  };
  api.storage.onChanged.addListener(onChanged);

  g.__dciExtension = {
    dci,
    stop() {
      api.storage.onChanged.removeListener(onChanged);
      dci.destroy();
      delete g.__dciExtension;
      report('off');
    },
  };
  report('on');
}

if (g.__dciExtension) g.__dciExtension.stop();
else void start();
