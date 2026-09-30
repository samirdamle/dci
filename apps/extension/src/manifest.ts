/** Browsers the build targets; each gets its own manifest from this one source. */
export type Target = 'chrome' | 'firefox';

/** The Manifest V3 manifest for `target`. */
export function manifest(target: Target, version: string) {
  return {
    manifest_version: 3,
    name: 'DCI: point, then ask',
    short_name: 'DCI',
    description:
      'Hold Alt and click anything on a page (a row, a price, a paragraph) to ask an AI about exactly that.',
    version,
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: {
      default_title: 'Turn DCI on or off for this tab',
      default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
    },
    // activeTab: DCI only runs on tabs where the user turned it on.
    permissions: ['activeTab', 'scripting', 'storage'],
    commands: {
      'toggle-dci': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Turn DCI on or off for this tab',
      },
    },
    background:
      target === 'chrome' ? { service_worker: 'background.js' } : { scripts: ['background.js'] },
    ...(target === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'dci@samirdamle.github.io', strict_min_version: '128.0' },
          },
        }
      : { minimum_chrome_version: '121' }),
  };
}
