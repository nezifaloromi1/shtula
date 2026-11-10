/**
 * Keep the temporary Quran refresh status in the notification list without
 * showing a foreground heads-up banner or playing a sound. Other notifications
 * retain the normal SDK 58 foreground presentation behavior.
 */
export function getNotificationPresentation(data: unknown) {
  const isQuranRefresh = typeof data === 'object' && data !== null &&
    'kind' in data && data.kind === 'quran-library-refresh';

  return {
    shouldPlaySound: !isQuranRefresh,
    shouldSetBadge: false,
    shouldShowBanner: !isQuranRefresh,
    shouldShowList: true,
  } as const;
}
