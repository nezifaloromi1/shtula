import {
  normalizeLayoutMode,
  normalizeLayoutOrder,
  type QuranLayoutMode,
  type QuranLayoutOrder,
} from './layoutPolicy';

export type LegacyPreferenceValue = string | number | boolean;
export type LegacyDisplayPreferences = {
  autoOpenNowPlaying: boolean;
  layoutMode: QuranLayoutMode;
  layoutOrder: QuranLayoutOrder;
  layoutHighlight: boolean;
  layoutCount: boolean;
};

export function readLegacyBoolean(
  values: Readonly<Record<string, LegacyPreferenceValue>>,
  key: string,
  fallback: boolean,
): boolean {
  const value = values[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no', ''].includes(normalized)) return false;
  }
  return fallback;
}

export function readLegacyNumber(
  values: Readonly<Record<string, LegacyPreferenceValue>>,
  key: string,
  fallback: number,
): number {
  const value = values[key];
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapLegacyDisplayPreferences(
  current: LegacyDisplayPreferences,
  values: Readonly<Record<string, LegacyPreferenceValue>>,
): LegacyDisplayPreferences {
  const layoutOrder = values.layoutOrder;
  return {
    autoOpenNowPlaying: readLegacyBoolean(values, 'autoopennowplaying', current.autoOpenNowPlaying),
    layoutMode: normalizeLayoutMode(readLegacyNumber(values, 'layout', current.layoutMode), current.layoutMode),
    layoutOrder: normalizeLayoutOrder(typeof layoutOrder === 'string' ? layoutOrder : current.layoutOrder, current.layoutOrder),
    layoutHighlight: readLegacyBoolean(values, 'layoutHighlight', current.layoutHighlight),
    layoutCount: readLegacyBoolean(values, 'layoutCount', current.layoutCount),
  };
}
