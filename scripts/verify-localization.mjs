import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const directory = join(root, 'src/localization/catalogs');
const expected = ['en', 'de', 'es', 'gl', 'it', 'nl', 'ru', 'tr', 'vi', 'zh_Hans', 'om', 'am', 'ar'];
const newLocales = ['om', 'am', 'ar'];
const localeIndex = readFileSync(join(root, 'src/localization/index.ts'), 'utf8');
const localizationProvider = readFileSync(join(root, 'src/localization/LocalizationProvider.tsx'), 'utf8');
const appConfig = readFileSync(join(root, 'app.config.js'), 'utf8');
const sharedText = readFileSync(join(root, 'src/tds/components/Text.tsx'), 'utf8');
const errors = [];
if (!localeIndex.includes("'om'") || !localeIndex.includes("'am'") || !localeIndex.includes("'ar'")) errors.push('Localization index is missing one or more new locale codes.');
if (!localizationProvider.includes('I18nManager.forceRTL(nextRTL)')) errors.push('Manual Arabic selection does not configure native RTL direction.');
if (!appConfig.includes('supportsRTL: true') || !appConfig.includes("'om', 'am', 'ar'")) errors.push('Expo localization config is missing the new supported locales or RTL support.');
if (!sharedText.includes('nativeScriptText')) errors.push('Shared text component is missing script font fallback for Amharic and Arabic.');
const catalogs = {};
for (const locale of expected) {
  const file = join(directory, `${locale}.json`);
  if (!existsSync(file)) {
    errors.push(`Missing locale catalog: ${locale}`);
    continue;
  }
  try {
    catalogs[locale] = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${locale}.json: ${String(error)}`);
  }
}
if (!catalogs.en) errors.push('English fallback catalog is required.');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const required = new Set([
  'home', 'downloads', 'settings_label', 'chapters_label', 'transcript_label',
  'play_button_label', 'pause_button_label', 'sleep_timer_label', 'home_quran_audio_label',
  'app_language_label', 'import_legacy_backup_label',
  'settings_theme_value_auto', 'settings_theme_value_light', 'settings_theme_value_dark',
  'settings_auto_update_episodes_never', 'settings_auto_update_episodes_1hour',
  'settings_auto_update_episodes_3hour', 'settings_auto_update_episodes_6hour',
  'settings_auto_update_episodes_12hour', 'settings_auto_update_episodes_24hour',
  'settings_auto_update_episodes_48hour', 'language_system_default',
  'language_direction_restart_title', 'language_direction_restart_message',
  'offline_storage_title', 'offline_storage_message', 'about_description',
  'storage_unavailable_title', 'storage_unavailable_message', 'some_files_import_failed_title',
  'import_failed_title', 'backup_already_imported_title', 'backup_already_imported_message',
  'flutter_backup_imported_title', 'flutter_backup_imported_message', 'backup_import_failed_title',
  'download_failed_title', 'delete_audio_failed_title', 'tafsiira_label', 'home_featured_subtitle',
  'video_label', 'biography_subtitle', 'play_all_label', 'import_more_audio_label', 'files_count_label',
  'settings_auto_open_now_playing', 'layout_label', 'semantics_layout_option_list',
  'semantics_layout_option_compact_grid', 'semantics_layout_option_grid',
  'layout_selector_highlight_new_episodes', 'layout_selector_unplayed_episodes',
  'layout_selector_sort_by', 'layout_selector_sort_by_alphabetical', 'layout_selector_sort_by_followed',
  'layout_selector_sort_by_unplayed', 'library_sort_latest_episodes_label',
  'unplayed_episode_count_label', 'episodes_available_count_label', 'new_episode_count_label', 'new_badge_label',
  'settings_background_updates_divider_label', 'settings_background_refresh_option', 'settings_background_refresh_option_subtitle',
  'settings_background_refresh_mobile_data_option', 'settings_background_refresh_mobile_data_option_subtitle',
  'settings_refresh_notification_option', 'settings_refresh_notification_option_subtitle',
  'background_refresh_notification_title', 'background_refresh_notification_body', 'background_refresh_schedule_note',
  'background_refresh_requires_native_build', 'background_refresh_auto_updates_required',
  'background_refresh_notifications_permission_title', 'background_refresh_notifications_permission_message',
  'settings_auto_update_episodes_always', 'settings_auto_update_episodes_10min', 'settings_auto_update_episodes_30min',
]);
for (const file of walk(join(root, 'src')).filter((name) => /\.(tsx?|jsx?)$/.test(name))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bt\(['"]([^'"]+)['"]/g)) required.add(match[1]);
}
for (const key of required) {
  if (typeof catalogs.en?.[key] !== 'string') {
    errors.push(`English fallback is missing UI key: ${key}`);
    continue;
  }
  for (const locale of newLocales) {
    const value = catalogs[locale]?.[key];
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${locale} is missing active UI key: ${key}`);
      continue;
    }
    const sourceTokens = [...(catalogs.en[key].matchAll(/\{([a-zA-Z][\w]*)\}/g))].map((match) => match[1]).sort();
    const translatedTokens = [...value.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map((match) => match[1]).sort();
    if (JSON.stringify(sourceTokens) !== JSON.stringify(translatedTokens)) {
      errors.push(`${locale}.${key} has different interpolation placeholders: ${translatedTokens.join(', ')}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  for (const locale of expected) {
    const catalog = catalogs[locale];
    const translatedCount = Object.keys(catalog).filter((key) => typeof catalog[key] === 'string').length;
    const fallbackCount = Object.keys(catalogs.en).filter((key) => !(key in catalog)).length;
    console.log(`${locale}: ${translatedCount} translations, ${fallbackCount} English fallbacks`);
  }
  console.log(`Passed: ${required.size} active UI strings are translated in Afaan Oromoo, Amharic and Arabic; interpolation placeholders match English.`);
}
