import { ext } from './ext';
import { readSecrets, SECRETS_KEY, type Secrets } from './secrets';
import { readSettings, SETTINGS_KEY, type Settings } from './settings';

/** Settings from `storage.local`, over the defaults. */
export async function loadSettings(): Promise<Settings> {
  return readSettings((await ext().storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
}

/** Merge `patch` into the stored settings; open tabs pick the change up live. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await ext().storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Only the options page and the worker call these. */
export async function loadSecrets(): Promise<Secrets> {
  return readSecrets((await ext().storage.local.get(SECRETS_KEY))[SECRETS_KEY]);
}

export async function saveSecrets(secrets: Secrets): Promise<void> {
  await ext().storage.local.set({ [SECRETS_KEY]: secrets });
}
