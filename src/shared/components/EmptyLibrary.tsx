import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { ActionButton } from './ActionButton';
import { useLocalization } from '@/localization/LocalizationProvider';

export function EmptyLibrary({ onImport }: { onImport: () => void }) {
  const palette = usePalette();
  const { t } = useLocalization();
  return <View style={styles.container}>
    <View style={[styles.icon, { backgroundColor: palette.raised }]}><Ionicons name="headset-outline" size={34} color="#0066CC" /></View>
    <AppText style={textStyles.subheading}>{t('no_downloads_message')}</AppText>
    <AppText style={[textStyles.body, { color: palette.muted, textAlign: 'center', maxWidth: 300 }]}>{t('home_no_quran_audio_message')}</AppText>
    <ActionButton title={t('drive_download_button_label')} onPress={onImport} />
  </View>;
}
const styles = StyleSheet.create({ container: { minHeight: 250, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 }, icon: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center' } });
