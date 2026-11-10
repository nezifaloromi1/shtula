import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useAudio } from '@/app/providers/AudioProvider';
import { useLocalization } from '@/localization/LocalizationProvider';

function htmlToReadableText(value: string): string {
  return value
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*[^>]*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function ShowNotesScreen() {
  const palette = usePalette();
  const { t } = useLocalization();
  const { currentTrack } = useAudio();
  const notes = useMemo(() => htmlToReadableText(currentTrack?.description ?? ''), [currentTrack?.description]);
  return <Screen>
    <TopBar title={t('show_notes_label')} />
    {notes ? <ScrollView contentContainerStyle={styles.content}>
      <AppText style={textStyles.subheading}>{currentTrack?.title ?? t('episode_details_button_label')}</AppText>
      <AppText style={[styles.notes, { color: palette.text }]}>{notes}</AppText>
    </ScrollView> : <View style={styles.empty}>
      <Ionicons name="document-text-outline" size={34} color={palette.muted} />
      <AppText style={textStyles.subheading}>{t('no_transcript_available_label')}</AppText>
      <AppText style={{ color: palette.muted, textAlign: 'center', lineHeight: 21 }}>{currentTrack ? t('no_transcript_available_label') : t('no_downloads_message')}</AppText>
    </View>}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24, gap: 14 },
  notes: { fontFamily: 'Inter', fontSize: 14, lineHeight: 23 },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
});
