export const NAVIGATION_EVENT = 'akiva:navigation';

export function navigateToPath(path: string, options: { replace?: boolean } = {}) {
  if (typeof window === 'undefined') return;
  const method = options.replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', path);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}
