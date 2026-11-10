/** Refresh periods supported by the original Flutter settings contract.
 * -1 disables automatic refresh, 0 means refresh on every eligible foreground.
 */
export const SUPPORTED_REFRESH_PERIODS = new Set([-1, 0, 10, 30, 60, 180, 360, 720, 1440, 2880]);

export function normalizeRefreshPeriod(value: number): number {
  return SUPPORTED_REFRESH_PERIODS.has(value) ? value : 180;
}

export function shouldRefreshQuranFeed(input: {
  hasCachedFeaturedItems: boolean;
  lastRefreshAt: number;
  periodMinutes: number;
  now?: number;
}): boolean {
  const { hasCachedFeaturedItems, lastRefreshAt, now = Date.now() } = input;
  const period = normalizeRefreshPeriod(input.periodMinutes);

  // Even when automatic refresh is disabled, the app must perform its first
  // fetch so a fresh installation can populate the Quran collection.
  if (!hasCachedFeaturedItems) return true;
  if (period < 0) return false;
  if (period === 0) return true;

  const elapsedMs = now - lastRefreshAt;
  return !Number.isFinite(lastRefreshAt) || lastRefreshAt <= 0 || elapsedMs >= period * 60_000;
}
