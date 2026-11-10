import { readLegacyBoolean, type LegacyPreferenceValue } from './legacyDisplayPreferences';

export type LegacyBackgroundPreferences = {
  backgroundRefreshEnabled: boolean;
  backgroundRefreshOnMobileData: boolean;
  backgroundRefreshNotifications: boolean;
};

/** Maps the original Flutter SharedPreferences background-refresh keys. */
export function mapLegacyBackgroundPreferences(
  current: LegacyBackgroundPreferences,
  values: Readonly<Record<string, LegacyPreferenceValue>>,
): LegacyBackgroundPreferences {
  return {
    backgroundRefreshEnabled: readLegacyBoolean(values, 'backgroundUpdate', current.backgroundRefreshEnabled),
    backgroundRefreshOnMobileData: readLegacyBoolean(values, 'backgroundUpdateMobileData', current.backgroundRefreshOnMobileData),
    backgroundRefreshNotifications: readLegacyBoolean(values, 'updateNotification', current.backgroundRefreshNotifications),
  };
}
