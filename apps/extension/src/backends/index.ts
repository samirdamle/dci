import { isSecureEndpoint } from '../privacy';
import type { Secrets } from '../secrets';
import type { Settings } from '../settings';
import { claudeBackend, type History } from './claude';
import { endpointBackend } from './endpoint';
import { offlineBackend } from './offline';
import type { Backend } from './types';

export type { Backend } from './types';

/** A backend that only explains what to set up. */
const needsSetup = (message: string): Backend =>
  async function* () {
    yield { type: 'error', message, code: 'not_configured' };
  };

/** The backend the settings choose, or one that says what's missing. */
export function selectBackend(settings: Settings, secrets: Secrets, history: History): Backend {
  switch (settings.backend) {
    case 'endpoint':
      if (
        settings.endpointUrl &&
        secrets.endpointAuthorization &&
        !isSecureEndpoint(new URL(settings.endpointUrl))
      ) {
        return needsSetup(
          'Use an https endpoint URL: the Authorization header is never sent over http.',
        );
      }
      return settings.endpointUrl
        ? endpointBackend({
            url: settings.endpointUrl,
            ...(secrets.endpointAuthorization
              ? { authorization: secrets.endpointAuthorization }
              : {}),
          })
        : needsSetup('Set the URL of your DCI endpoint in the DCI extension options.');
    case 'claude':
      return secrets.anthropicApiKey
        ? claudeBackend({ apiKey: secrets.anthropicApiKey, model: settings.claudeModel, history })
        : needsSetup('Add your Anthropic API key in the DCI extension options.');
    default:
      return offlineBackend();
  }
}
