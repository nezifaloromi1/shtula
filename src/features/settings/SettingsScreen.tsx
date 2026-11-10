import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, Switch, View, StyleSheet, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { Surface } from '@/tds/components/Surface';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import { useLocalization } from '@/localization/LocalizationProvider';
import { languageOptions } from '@/localization';
import { getBackgroundRefreshAvailability, requestQuranRefreshNotificationPermission } from '@/features/quran/services/backgroundQuranRefresh';

const themeOptions = [
  { value: 'system' as const, label: 'settings_theme_value_auto', icon: 'phone-portrait-outline' as const },
  { value: 'light' as const, label: 'settings_theme_value_light', icon: 'sunny-outline' as const },
  { value: 'dark' as const, label: 'settings_theme_value_dark', icon: 'moon-outline' as const },
];

const layoutModes = [
  { value: 0 as const, label: 'semantics_layout_option_list', icon: 'list-outline' as const },
  { value: 1 as const, label: 'semantics_layout_option_compact_grid', icon: 'grid-outline' as const },
  { value: 2 as const, label: 'semantics_layout_option_grid', icon: 'grid' as const },
];

const layoutOrders = [
  { value: 'alphabetical' as const, label: 'layout_selector_sort_by_alphabetical' },
  { value: 'followed' as const, label: 'layout_selector_sort_by_followed' },
  { value: 'unplayed' as const, label: 'layout_selector_sort_by_unplayed' },
  { value: 'episodes' as const, label: 'library_sort_latest_episodes_label' },
];

const refreshOptions = [
  { value: -1, label: 'settings_auto_update_episodes_never' },
  { value: 0, label: 'settings_auto_update_episodes_always' },
  { value: 10, label: 'settings_auto_update_episodes_10min' },
  { value: 30, label: 'settings_auto_update_episodes_30min' },
  { value: 60, label: 'settings_auto_update_episodes_1hour' },
  { value: 180, label: 'settings_auto_update_episodes_3hour' },
  { value: 360, label: 'settings_auto_update_episodes_6hour' },
  { value: 720, label: 'settings_auto_update_episodes_12hour' },
  { value: 1440, label: 'settings_auto_update_episodes_24hour' },
  { value: 2880, label: 'settings_auto_update_episodes_48hour' },
] as const;

type ToggleRowProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  borderColor: string;
  mutedColor: string;
  disabled?: boolean;
};

function ToggleRow({ icon, label, subtitle, value, onValueChange, borderColor, mutedColor, disabled = false }: ToggleRowProps) {
  return <View style={[styles.option, { borderBottomColor: borderColor, opacity: disabled ? 0.48 : 1 }]}>
    <Ionicons name={icon} size={20} color={mutedColor} />
    <View style={{ flex: 1, gap: subtitle ? 3 : 0 }}>
      <AppText style={{ fontFamily: 'Inter-Medium', fontSize: 14 }}>{label}</AppText>
      {subtitle ? <AppText style={{ color: mutedColor, fontSize: 11, lineHeight: 15 }}>{subtitle}</AppText> : null}
    </View>
    <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
  </View>;
}

export default function SettingsScreen() {
  const palette = usePalette();
  const { t, locale, languagePreference, isRTL, setLanguage } = useLocalization();
  const forwardChevron = isRTL ? 'chevron-back' : 'chevron-forward';
  const { settings, updateSettings, downloadedTracks, importLegacyBackup } = useQuranLibrary();
  const [refreshSelectorOpen, setRefreshSelectorOpen] = useState(false);
  const [languageSelectorOpen, setLanguageSelectorOpen] = useState(false);
  const [layoutSelectorOpen, setLayoutSelectorOpen] = useState(false);
  const [backgroundRefreshAvailable, setBackgroundRefreshAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void getBackgroundRefreshAvailability().then((available) => {
      if (active) setBackgroundRefreshAvailable(available);
    });
    return () => { active = false; };
  }, []);

  const handleBackgroundRefreshChange = (value: boolean) => {
    if (value && settings.autoUpdatePeriodMinutes < 0) {
      Alert.alert(t('settings_background_refresh_option'), t('background_refresh_auto_updates_required'));
      return;
    }
    void updateSettings({ backgroundRefreshEnabled: value });
  };

  const handleRefreshNotificationsChange = async (value: boolean) => {
    if (value) {
      try {
        const permitted = await requestQuranRefreshNotificationPermission();
        if (!permitted) {
          Alert.alert(t('background_refresh_notifications_permission_title'), t('background_refresh_notifications_permission_message'));
          return;
        }
      } catch (error) {
        console.warn('Quran refresh notification permission could not be requested.', error);
        Alert.alert(t('background_refresh_notifications_permission_title'), t('background_refresh_notifications_permission_message'));
        return;
      }
    }
    void updateSettings({ backgroundRefreshNotifications: value });
  };
  const selectedLanguageName = languagePreference === 'system'
    ? t('language_system_default')
    : languageOptions.find((option) => option.value === languagePreference)?.nativeName ?? locale;
  const selectedLayoutLabel = t(layoutModes.find((option) => option.value === settings.layoutMode)?.label ?? 'semantics_layout_option_list');
  const selectedLayoutOrderLabel = t(layoutOrders.find((option) => option.value === settings.layoutOrder)?.label ?? 'layout_selector_sort_by_alphabetical');
  const selectedRefreshLabel = useMemo(() => {
    const selected = refreshOptions.find((option) => option.value === settings.autoUpdatePeriodMinutes);
    return t(selected?.label ?? 'settings_auto_update_episodes_never');
  }, [settings.autoUpdatePeriodMinutes, t]);

  return <Screen>
    <TopBar title={t('settings_label')} />

    <View style={{ gap: 10 }}>
      <AppText style={textStyles.subheading}>{t('settings_personalisation_divider_label')}</AppText>
      <Surface style={styles.options}>
        {themeOptions.map(option => <Pressable key={option.value} onPress={() => void updateSettings({ themeMode: option.value })} style={[styles.option, { borderBottomColor: palette.border }]}>
          <Ionicons name={option.icon} size={20} color={palette.muted} />
          <AppText style={{ flex: 1, fontFamily: 'Inter-Medium', fontSize: 14 }}>{t(option.label)}</AppText>
          {settings.themeMode === option.value ? <Ionicons name="checkmark-circle" color="#0066CC" size={21} /> : null}
        </Pressable>)}
        <Pressable onPress={() => setLayoutSelectorOpen(true)} style={styles.option}>
          <Ionicons name="grid-outline" size={20} color={palette.muted} />
          <View style={{ flex: 1, gap: 3 }}>
            <AppText style={{ fontFamily: 'Inter-Medium', fontSize: 14 }}>{t('layout_label')}</AppText>
            <AppText style={{ color: palette.muted, fontSize: 11 }}>{selectedLayoutLabel} · {selectedLayoutOrderLabel}</AppText>
          </View>
          <Ionicons name={forwardChevron} size={18} color={palette.muted} />
        </Pressable>
      </Surface>
    </View>

    <View style={{ gap: 10 }}>
      <AppText style={textStyles.subheading}>{t('settings_episodes_divider_label')}</AppText>
      <Surface style={styles.options}>
        <ToggleRow
          icon="checkmark-circle-outline"
          label={t('settings_mark_deleted_played_label')}
          value={settings.markDeletedEpisodesAsPlayed}
          onValueChange={(value) => void updateSettings({ markDeletedEpisodesAsPlayed: value })}
          borderColor={palette.border}
          mutedColor={palette.muted}
        />
        <ToggleRow
          icon="trash-outline"
          label={t('settings_delete_played_label')}
          value={settings.deleteDownloadedPlayedEpisodes}
          onValueChange={(value) => void updateSettings({ deleteDownloadedPlayedEpisodes: value })}
          borderColor={palette.border}
          mutedColor={palette.muted}
        />
        <Pressable onPress={() => setRefreshSelectorOpen(true)} style={styles.option}>
          <Ionicons name="refresh-outline" size={20} color={palette.muted} />
          <View style={{ flex: 1, gap: 3 }}>
            <AppText style={{ fontFamily: 'Inter-Medium', fontSize: 14 }}>{t('settings_auto_update_episodes')}</AppText>
            <AppText style={{ color: palette.muted, fontSize: 11 }}>{selectedRefreshLabel}</AppText>
          </View>
          <Ionicons name={forwardChevron} size={18} color={palette.muted} />
        </Pressable>
      </Surface>
    </View>

    <View style={{ gap: 10 }}>
      <AppText style={textStyles.subheading}>{t('settings_background_updates_divider_label')}</AppText>
      <Surface style={styles.options}>
        <ToggleRow
          icon="sync-outline"
          label={t('settings_background_refresh_option')}
          subtitle={t('settings_background_refresh_option_subtitle')}
          value={settings.backgroundRefreshEnabled}
          onValueChange={handleBackgroundRefreshChange}
          borderColor={palette.border}
          mutedColor={palette.muted}
        />
        <ToggleRow
          icon="cellular-outline"
          label={t('settings_background_refresh_mobile_data_option')}
          subtitle={t('settings_background_refresh_mobile_data_option_subtitle')}
          value={settings.backgroundRefreshOnMobileData}
          onValueChange={(value) => void updateSettings({ backgroundRefreshOnMobileData: value })}
          borderColor={palette.border}
          mutedColor={palette.muted}
        />
        <ToggleRow
          icon="notifications-outline"
          label={t('settings_refresh_notification_option')}
          subtitle={t('settings_refresh_notification_option_subtitle')}
          value={settings.backgroundRefreshNotifications}
          onValueChange={(value) => void handleRefreshNotificationsChange(value)}
          borderColor={palette.border}
          mutedColor={palette.muted}
        />
      </Surface>
      <AppText style={{ color: palette.muted, fontSize: 11, lineHeight: 16 }}>{t('background_refresh_schedule_note')}</AppText>
      {backgroundRefreshAvailable === false ? <AppText style={{ color: palette.muted, fontSize: 11, lineHeight: 16 }}>{t('background_refresh_requires_native_build')}</AppText> : null}
    </View>

    <View style={{ gap: 10 }}>
      <AppText style={textStyles.subheading}>{t('settings_playback_divider_label')}</AppText>
      <Surface style={styles.options}>
        <View style={[styles.option, { borderBottomColor: palette.border }]}>
          <Ionicons name="speedometer-outline" size={20} color={palette.muted} />
          <AppText style={{ flex: 1, fontFamily: 'Inter-Medium' }}>{t('audio_settings_playback_speed_label')}</AppText>
          <AppText style={{ color: '#0066CC', fontFamily: 'Inter-Bold' }}>{settings.playbackSpeed.toFixed(1)}×</AppText>
        </View>
        <View style={styles.speedControl}>
          <AppText style={{ color: palette.muted, fontSize: 11 }}>0.5×</AppText>
          <Slider style={styles.speedSlider} minimumValue={0.5} maximumValue={2} step={0.1} value={settings.playbackSpeed}
            onSlidingComplete={(value) => void updateSettings({ playbackSpeed: Math.round(value * 10) / 10 })}
            minimumTrackTintColor="#0066CC" maximumTrackTintColor={palette.border} thumbTintColor="#0066CC" />
          <AppText style={{ color: palette.muted, fontSize: 11 }}>2.0×</AppText>
        </View>
        {Platform.OS === 'android' ? <>
          <ToggleRow
            icon="remove-circle-outline"
            label={t('audio_effect_trim_silence_label')}
            value={settings.trimSilence}
            onValueChange={(value) => void updateSettings({ trimSilence: value })}
            borderColor={palette.border}
            mutedColor={palette.muted}
          />
          <ToggleRow
            icon="volume-high-outline"
            label={t('audio_effect_volume_boost_label')}
            value={settings.volumeBoost}
            onValueChange={(value) => void updateSettings({ volumeBoost: value })}
            borderColor={palette.border}
            mutedColor={palette.muted}
          />
        </> : null}
        <ToggleRow
          icon="open-outline"
          label={t('settings_auto_open_now_playing')}
          value={settings.autoOpenNowPlaying}
          onValueChange={(value) => void updateSettings({ autoOpenNowPlaying: value })}
          borderColor={palette.border}
          mutedColor={palette.muted}
        />
        <ToggleRow
          icon="play-skip-forward-outline"
          label={t('settings_continuous_play_option')}
          subtitle={t('settings_continuous_play_subtitle')}
          value={settings.autoPlayNext}
          onValueChange={(value) => void updateSettings({ autoPlayNext: value })}
          borderColor={palette.border}
          mutedColor={palette.muted}
        />
      </Surface>
    </View>

    <View style={{ gap: 10 }}>
      <AppText style={textStyles.subheading}>{t('settings_data_divider_label')}</AppText>
      <Surface style={styles.options}>
        <View style={[styles.option, { borderBottomColor: palette.border }]}><Ionicons name="folder-outline" size={20} color={palette.muted} /><AppText style={{ flex: 1, fontFamily: 'Inter-Medium' }}>{t('drive_library_label')}</AppText><AppText style={{ color: palette.muted }}>{downloadedTracks.length}</AppText></View>
        <Pressable onPress={() => Alert.alert(t('about_label'), t('about_description')) } style={[styles.option, { borderBottomColor: palette.border }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={palette.muted} /><AppText style={{ flex: 1, fontFamily: 'Inter-Medium' }}>{t('about_label')}</AppText><Ionicons name={forwardChevron} size={18} color={palette.muted} />
        </Pressable>
        <Pressable onPress={() => setLanguageSelectorOpen(true)} style={[styles.option, { borderBottomColor: palette.border }]}>
          <Ionicons name="language-outline" size={20} color={palette.muted} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={{ fontFamily: 'Inter-Medium' }}>{t('app_language_label')}</AppText>
            <AppText style={{ color: palette.muted, fontSize: 11 }}>{selectedLanguageName}</AppText>
          </View>
          <Ionicons name={forwardChevron} size={18} color={palette.muted} />
        </Pressable>
        <Pressable onPress={() => void importLegacyBackup()} style={styles.option}>
          <Ionicons name="cloud-download-outline" size={20} color={palette.muted} />
          <View style={{ flex: 1, gap: 3 }}>
            <AppText style={{ fontFamily: 'Inter-Medium' }}>{t('import_legacy_backup_label')}</AppText>
            <AppText style={{ color: palette.muted, fontSize: 11 }}>{t('import_legacy_backup_description')}</AppText>
          </View>
          <Ionicons name={forwardChevron} size={18} color={palette.muted} />
        </Pressable>
      </Surface>
    </View>

    <Modal visible={refreshSelectorOpen} transparent animationType="fade" onRequestClose={() => setRefreshSelectorOpen(false)}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setRefreshSelectorOpen(false)} />
        <Surface style={styles.refreshDialog}>
          <AppText style={styles.dialogTitle}>{t('settings_auto_update_episodes_heading')}</AppText>
          {refreshOptions.map((option, index) => <Pressable key={option.value} onPress={() => {
            setRefreshSelectorOpen(false);
            void updateSettings({ autoUpdatePeriodMinutes: option.value });
          }} style={[styles.refreshOption, index < refreshOptions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }]}>
            <AppText style={{ flex: 1, color: palette.text, fontFamily: 'Inter-Medium' }}>{t(option.label)}</AppText>
            {settings.autoUpdatePeriodMinutes === option.value ? <Ionicons name="checkmark-circle" color="#0066CC" size={20} /> : null}
          </Pressable>)}
        </Surface>
      </View>
    </Modal>

    <Modal visible={layoutSelectorOpen} transparent animationType="fade" onRequestClose={() => setLayoutSelectorOpen(false)}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setLayoutSelectorOpen(false)} />
        <Surface style={styles.layoutDialog}>
          <AppText style={styles.dialogTitle}>{t('layout_label')}</AppText>
          <View style={styles.layoutModes}>
            {layoutModes.map((option) => <Pressable key={option.value} onPress={() => void updateSettings({ layoutMode: option.value })}
              accessibilityRole="radio" accessibilityState={{ selected: settings.layoutMode === option.value }} style={[styles.layoutMode, { borderColor: settings.layoutMode === option.value ? '#0066CC' : palette.border, backgroundColor: settings.layoutMode === option.value ? 'rgba(0,102,204,0.10)' : 'transparent' }]}>
              <Ionicons name={option.icon} size={22} color={settings.layoutMode === option.value ? '#0066CC' : palette.muted} />
              <AppText style={{ fontSize: 10, textAlign: 'center', color: settings.layoutMode === option.value ? '#0066CC' : palette.text }}>{t(option.label)}</AppText>
            </Pressable>)}
          </View>
          <View style={[styles.layoutDivider, { backgroundColor: palette.border }]} />
          <AppText style={[styles.layoutHeading, { color: palette.muted }]}>{t('layout_selector_sort_by')}</AppText>
          {layoutOrders.map((option) => <Pressable key={option.value} onPress={() => void updateSettings({ layoutOrder: option.value })} style={styles.refreshOption} accessibilityRole="radio" accessibilityState={{ selected: settings.layoutOrder === option.value }}>
            <AppText style={{ flex: 1, color: palette.text, fontFamily: 'Inter-Medium' }}>{t(option.label)}</AppText>
            {settings.layoutOrder === option.value ? <Ionicons name="checkmark-circle" color="#0066CC" size={20} /> : null}
          </Pressable>)}
          <View style={[styles.layoutDivider, { backgroundColor: palette.border }]} />
          <ToggleRow
            icon="sparkles-outline"
            label={t('layout_selector_highlight_new_episodes')}
            value={settings.layoutHighlight}
            onValueChange={(value) => void updateSettings({ layoutHighlight: value })}
            borderColor={palette.border}
            mutedColor={palette.muted}
          />
          <ToggleRow
            icon="stats-chart-outline"
            label={t('layout_selector_unplayed_episodes')}
            value={settings.layoutCount}
            onValueChange={(value) => void updateSettings({ layoutCount: value })}
            borderColor={palette.border}
            mutedColor={palette.muted}
          />
          <Pressable onPress={() => setLayoutSelectorOpen(false)} style={styles.layoutDone}><AppText style={{ color: '#0066CC', fontFamily: 'Inter-Bold' }}>{t('close_button_label')}</AppText></Pressable>
        </Surface>
      </View>
    </Modal>

    <Modal visible={languageSelectorOpen} transparent animationType="fade" onRequestClose={() => setLanguageSelectorOpen(false)}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setLanguageSelectorOpen(false)} />
        <Surface style={styles.refreshDialog}>
          <AppText style={styles.dialogTitle}>{t('app_language_label')}</AppText>
          {languageOptions.map((option, index) => <Pressable key={option.value} onPress={() => {
            setLanguageSelectorOpen(false);
            void setLanguage(option.value);
          }} style={[styles.refreshOption, index < languageOptions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }]}>
            <AppText style={{ flex: 1, color: palette.text, fontFamily: 'Inter-Medium' }}>
              {option.value === 'system' ? t('language_system_default') : option.nativeName}
            </AppText>
            {languagePreference === option.value ? <Ionicons name="checkmark-circle" color="#0066CC" size={20} /> : null}
          </Pressable>)}
        </Surface>
      </View>
    </Modal>

    <AppText style={{ color: palette.muted, textAlign: 'center', fontSize: 11 }}>Sheademtula · Version 1.0.0</AppText>
  </Screen>;
}

const styles = StyleSheet.create({
  options: { paddingHorizontal: 14 },
  option: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  speedControl: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4 },
  speedSlider: { flex: 1, height: 36 },
  modalRoot: { flex: 1, padding: 28, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'center' },
  refreshDialog: { padding: 18, borderRadius: 20, gap: 0 },
  layoutDialog: { padding: 18, borderRadius: 20, gap: 4 },
  layoutModes: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  layoutMode: { flex: 1, minHeight: 68, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 7, padding: 5 },
  layoutDivider: { height: StyleSheet.hairlineWidth, marginVertical: 7 },
  layoutHeading: { fontFamily: 'Inter-Medium', fontSize: 11, marginTop: 3 },
  layoutDone: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  dialogTitle: { fontFamily: 'Inter-Bold', fontSize: 17, textAlign: 'center', marginBottom: 8 },
  refreshOption: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
