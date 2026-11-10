import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { getLocales } from 'expo-localization';
import { initializeDatabase, listQuranAudio, readSetting, upsertFeaturedQuranAudio, writeSetting } from '@/storage/database';
import { loadFeaturedQuranFeed } from './featuredQuranFeed';
import { performBackgroundQuranRefresh, backgroundRefreshIntervalMinutes } from './backgroundRefreshPolicy';
import { resolveLocalePreference, translate } from '@/localization';

export const BACKGROUND_QURAN_REFRESH_TASK = 'sheademtula-background-quran-refresh';
const NOTIFICATION_CHANNEL_ID = 'quran-library-sync';
const MAX_BACKGROUND_FETCH_MS = 18_000;

type StoredPreferences = {
  language?: string;
  autoUpdatePeriodMinutes?: number;
  backgroundRefreshEnabled?: boolean;
  backgroundRefreshOnMobileData?: boolean;
  backgroundRefreshNotifications?: boolean;
};

async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: 'Quran library refresh',
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
    vibrationPattern: [],
    sound: null,
    showBadge: false,
  });
}

export async function requestQuranRefreshNotificationPermission(): Promise<boolean> {
  await ensureNotificationChannel();
  const hasAlertPermission = (response: Notifications.NotificationPermissionsStatus) => (
    response.granted || (
      Platform.OS === 'ios' &&
      response.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    )
  );
  const existing = await Notifications.getPermissionsAsync();
  if (hasAlertPermission(existing)) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return hasAlertPermission(requested);
}

export async function beginQuranRefreshStatusNotification(languagePreference: string): Promise<string | null> {
  await ensureNotificationChannel();
  const previousId = await readSetting<string | null>('backgroundRefreshNotificationId', null);
  if (previousId) {
    await Notifications.dismissNotificationAsync(previousId).catch(() => undefined);
    await writeSetting('backgroundRefreshNotificationId', null).catch(() => undefined);
  }

  const locale = resolveLocalePreference(languagePreference, getLocales());
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: translate(locale, 'background_refresh_notification_title'),
      body: translate(locale, 'background_refresh_notification_body'),
      sound: false,
      ...(Platform.OS === 'android' ? {
        sticky: true,
        priority: Notifications.AndroidNotificationPriority.LOW,
        vibrate: [],
      } : { interruptionLevel: 'passive' as const }),
      data: { screen: 'Tafsiira', kind: 'quran-library-refresh' },
    },
    trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
  });

  try {
    await writeSetting('backgroundRefreshNotificationId', identifier);
    return identifier;
  } catch (error) {
    await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
    throw error;
  }
}

export async function finishQuranRefreshStatusNotification(identifier: string): Promise<void> {
  await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
  const storedId = await readSetting<string | null>('backgroundRefreshNotificationId', null).catch(() => null);
  if (storedId === identifier) {
    await writeSetting('backgroundRefreshNotificationId', null).catch(() => undefined);
  }
}

async function executeBackgroundRefresh(): Promise<BackgroundTask.BackgroundTaskResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_BACKGROUND_FETCH_MS);
  const expiration = Platform.OS === 'ios'
    ? BackgroundTask.addExpirationListener(() => controller.abort())
    : null;

  try {
    await initializeDatabase();
    const stored = await readSetting<StoredPreferences>('preferences', {});
    const preferences = {
      backgroundRefreshEnabled: stored.backgroundRefreshEnabled === true,
      backgroundRefreshOnMobileData: stored.backgroundRefreshOnMobileData === true,
      backgroundRefreshNotifications: stored.backgroundRefreshNotifications === true,
      autoUpdatePeriodMinutes: typeof stored.autoUpdatePeriodMinutes === 'number' ? stored.autoUpdatePeriodMinutes : 180,
    };

    const result = await performBackgroundQuranRefresh(preferences, {
      getNetworkState: () => Network.getNetworkStateAsync(),
      listTracks: () => listQuranAudio(),
      getLastRefreshAt: () => readSetting<number>('lastQuranFeedRefreshAt', 0),
      getNewTrackIds: () => readSetting<string[]>('newFeaturedTrackIds', []),
      setNewTrackIds: (ids) => writeSetting('newFeaturedTrackIds', ids),
      loadFeed: (signal) => loadFeaturedQuranFeed(signal),
      upsertTrack: (track) => upsertFeaturedQuranAudio(track),
      setLastRefreshAt: (timestamp) => writeSetting('lastQuranFeedRefreshAt', timestamp),
      beginRefreshNotification: () => beginQuranRefreshStatusNotification(stored.language ?? 'system'),
      finishRefreshNotification: finishQuranRefreshStatusNotification,
    }, controller.signal);

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('Scheduled Quran feed refresh failed.', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    clearTimeout(timeout);
    expiration?.remove();
  }
}

// Task definitions must be registered at module scope so the OS can start the
// JavaScript task without mounting React components or navigation.
if (!TaskManager.isTaskDefined(BACKGROUND_QURAN_REFRESH_TASK)) {
  TaskManager.defineTask(BACKGROUND_QURAN_REFRESH_TASK, executeBackgroundRefresh);
}

export type BackgroundRefreshRegistration = {
  available: boolean;
  registered: boolean;
};

export async function getBackgroundRefreshAvailability(): Promise<boolean> {
  try {
    const [taskManagerAvailable, status] = await Promise.all([
      TaskManager.isAvailableAsync(),
      BackgroundTask.getStatusAsync(),
    ]);
    return taskManagerAvailable && status === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    return false;
  }
}

export async function synchronizeBackgroundQuranRefresh(
  preferences: Pick<StoredPreferences, 'backgroundRefreshEnabled' | 'autoUpdatePeriodMinutes'>,
): Promise<BackgroundRefreshRegistration> {
  const desiredInterval = backgroundRefreshIntervalMinutes(preferences.autoUpdatePeriodMinutes ?? 180);
  const shouldRegister = preferences.backgroundRefreshEnabled === true && desiredInterval !== null;

  let registered = false;
  try {
    registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_QURAN_REFRESH_TASK);
  } catch {
    return { available: false, registered: false };
  }

  if (!shouldRegister) {
    if (registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_QURAN_REFRESH_TASK);
    return { available: await getBackgroundRefreshAvailability(), registered: false };
  }

  const available = await getBackgroundRefreshAvailability();
  if (!available) return { available: false, registered };

  if (registered) {
    const options = await TaskManager.getTaskOptionsAsync(BACKGROUND_QURAN_REFRESH_TASK) as { minimumInterval?: unknown } | null;
    if (typeof options?.minimumInterval === 'number' && options.minimumInterval === desiredInterval) {
      return { available: true, registered: true };
    }
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_QURAN_REFRESH_TASK);
  }

  await BackgroundTask.registerTaskAsync(BACKGROUND_QURAN_REFRESH_TASK, {
    minimumInterval: desiredInterval,
  });
  return { available: true, registered: true };
}
