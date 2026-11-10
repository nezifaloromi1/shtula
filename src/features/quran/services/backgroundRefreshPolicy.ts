import { findNewFeedIds } from './layoutPolicy';
import { normalizeRefreshPeriod, shouldRefreshQuranFeed } from './refreshPolicy';
import type { QuranAudio } from '../models/QuranAudio';

export type BackgroundRefreshPreferences = {
  backgroundRefreshEnabled: boolean;
  backgroundRefreshOnMobileData: boolean;
  backgroundRefreshNotifications: boolean;
  autoUpdatePeriodMinutes: number;
};

export type BackgroundNetworkState = {
  isConnected?: boolean;
  isInternetReachable?: boolean | null;
  type?: string | null;
};

export type BackgroundRefreshResult =
  | { status: 'disabled'; newTrackCount: 0 }
  | { status: 'network-unavailable'; newTrackCount: 0 }
  | { status: 'not-due'; newTrackCount: 0 }
  | { status: 'updated'; newTrackCount: number };

export type BackgroundRefreshDependencies = {
  getNetworkState: () => Promise<BackgroundNetworkState>;
  listTracks: () => Promise<QuranAudio[]>;
  getLastRefreshAt: () => Promise<number>;
  getNewTrackIds: () => Promise<string[]>;
  setNewTrackIds: (ids: string[]) => Promise<void>;
  loadFeed: (signal?: AbortSignal) => Promise<QuranAudio[]>;
  upsertTrack: (track: QuranAudio) => Promise<void>;
  setLastRefreshAt: (timestamp: number) => Promise<void>;
  beginRefreshNotification: () => Promise<string | null>;
  finishRefreshNotification: (notificationId: string) => Promise<void>;
  now?: () => number;
};

/** The OS scheduler treats this as a minimum interval; Android requires at least 15 minutes. */
export function backgroundRefreshIntervalMinutes(periodMinutes: number): number | null {
  const period = normalizeRefreshPeriod(periodMinutes);
  if (period < 0) return null;
  return Math.max(15, period === 0 ? 15 : period);
}

export function isBackgroundRefreshNetworkAllowed(
  network: BackgroundNetworkState,
  allowMobileData: boolean,
): boolean {
  if (network.isConnected !== true || network.isInternetReachable === false) return false;
  const connectionType = network.type?.toUpperCase();
  if (connectionType === 'WIFI') return true;
  if (connectionType === 'CELLULAR') return allowMobileData;
  // Match the Flutter policy: only Wi-Fi is allowed by default; mobile data
  // requires opt-in. Unknown, VPN, Ethernet and other transports fail closed.
  return false;
}

/**
 * The same refresh pipeline is used by the headless task and covered with injected
 * dependencies so feed parsing, gating, SQLite writes and notifications remain testable.
 */
export async function performBackgroundQuranRefresh(
  preferences: BackgroundRefreshPreferences,
  dependencies: BackgroundRefreshDependencies,
  signal?: AbortSignal,
): Promise<BackgroundRefreshResult> {
  const period = normalizeRefreshPeriod(preferences.autoUpdatePeriodMinutes);
  if (!preferences.backgroundRefreshEnabled || period < 0) {
    return { status: 'disabled', newTrackCount: 0 };
  }

  const network = await dependencies.getNetworkState();
  if (!isBackgroundRefreshNetworkAllowed(network, preferences.backgroundRefreshOnMobileData)) {
    return { status: 'network-unavailable', newTrackCount: 0 };
  }

  const cachedTracks = await dependencies.listTracks();
  const cachedFeaturedTracks = cachedTracks.filter((track) => track.sourceType === 'featured-google-drive');
  const lastRefreshAt = await dependencies.getLastRefreshAt();
  if (!shouldRefreshQuranFeed({
    hasCachedFeaturedItems: cachedFeaturedTracks.length > 0,
    lastRefreshAt,
    periodMinutes: period,
    now: dependencies.now?.() ?? Date.now(),
  })) {
    return { status: 'not-due', newTrackCount: 0 };
  }

  if (signal?.aborted) throw new Error('Background Quran feed refresh was cancelled.');

  // The original Flutter app shows a silent "Library Update" service notification
  // during the refresh and removes it when the operation completes. It is not a
  // notification claiming that new lessons were found.
  let refreshNotificationId: string | null = null;
  if (preferences.backgroundRefreshNotifications) {
    try {
      refreshNotificationId = await dependencies.beginRefreshNotification();
    } catch {
      // Notification permission can be revoked independently of the app setting.
    }
  }

  try {
    const remoteTracks = await dependencies.loadFeed(signal);
    if (!remoteTracks.length) throw new Error('The configured Quran feed contained no playable audio.');

    const newlyDiscoveredIds = findNewFeedIds(
      new Set(cachedFeaturedTracks.map((track) => track.id)),
      remoteTracks,
    );
    if (newlyDiscoveredIds.length > 0) {
      const storedNewIds = await dependencies.getNewTrackIds();
      const previouslyNewIds = Array.isArray(storedNewIds)
        ? storedNewIds.filter((id): id is string => typeof id === 'string')
        : [];
      await dependencies.setNewTrackIds([...new Set([...previouslyNewIds, ...newlyDiscoveredIds])]);
    }
    for (const track of remoteTracks) {
      if (signal?.aborted) throw new Error('Background Quran feed refresh was cancelled.');
      await dependencies.upsertTrack(track);
    }
    if (signal?.aborted) throw new Error('Background Quran feed refresh was cancelled.');

    const refreshedAt = dependencies.now?.() ?? Date.now();
    await dependencies.setLastRefreshAt(refreshedAt);
    return { status: 'updated', newTrackCount: newlyDiscoveredIds.length };
  } finally {
    if (refreshNotificationId) {
      try {
        await dependencies.finishRefreshNotification(refreshNotificationId);
      } catch {
        // A failed notification cleanup must not force the scheduler to repeat
        // a feed update that has already been committed to SQLite.
      }
    }
  }
}
