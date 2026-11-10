import { readLegacyBoolean, type LegacyPreferenceValue } from './legacyDisplayPreferences';

export type LegacyAudioPreferences = {
  trimSilence: boolean;
  volumeBoost: boolean;
};

/** Maps the original Flutter SharedPreferences audio-effect keys. */
export function mapLegacyAudioPreferences(
  current: LegacyAudioPreferences,
  values: Readonly<Record<string, LegacyPreferenceValue>>,
): LegacyAudioPreferences {
  return {
    trimSilence: readLegacyBoolean(values, 'trimSilence', current.trimSilence),
    volumeBoost: readLegacyBoolean(values, 'volumeBoost', current.volumeBoost),
  };
}
