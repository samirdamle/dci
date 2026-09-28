declare const process: { env: { NODE_ENV?: string } } | undefined;

/**
 * True unless the bundle was built for production. Bundlers replace
 * `process.env.NODE_ENV`; without one (plain ESM in a browser) we stay quiet.
 */
export const isDev = (): boolean =>
  typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

export type Warn = (message: string) => void;

/** Default dev-mode warning sink. */
export const devWarn: Warn = (message) => {
  if (isDev()) console.warn(`[dci] ${message}`);
};
