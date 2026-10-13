const KEY = 'dci-demo-tour-seen';

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Not remembered; the tour shows again on the next visit.
  }
}

/**
 * Whether the tour opens by itself: on a first visit, or always with
 * `?tour=on`. Automated browsers (tests, screenshots) skip it unless asked.
 */
export function shouldAutoOpenTour(
  search: string,
  automated = typeof navigator !== 'undefined' && navigator.webdriver,
): boolean {
  const param = new URLSearchParams(search).get('tour');
  if (param === 'on') return true;
  if (param === 'off' || automated) return false;
  return !tourSeen();
}
