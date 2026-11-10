import React, { useMemo, useState } from 'react';
import { TextInput, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { AudioRow } from '@/features/quran/components/AudioRow';
import { AppText } from '@/tds/components/Text';
import { QuranEpisodeDetailsSheet } from '@/features/quran/components/QuranEpisodeDetailsSheet';
import { usePalette } from '@/tds/theme';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import { useAudio } from '@/app/providers/AudioProvider';
import { usePlayQuranTrack } from '@/app/hooks/usePlayQuranTrack';
import { useLocalization } from '@/localization/LocalizationProvider';
import type { QuranAudio } from '@/features/quran/models/QuranAudio';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [detailsTrack, setDetailsTrack] = useState<QuranAudio | null>(null);
  const palette = usePalette();
  const { t, locale, isRTL } = useLocalization();
  const { tracks } = useQuranLibrary();
  const audio = useAudio();
  const playTrack = usePlayQuranTrack();
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? tracks.filter(track => `${track.title} ${track.artist} ${track.fileName}`.toLocaleLowerCase().includes(normalized)) : tracks;
  }, [query, tracks]);
  return <Screen>
    <TopBar title={t('search_button_label')} />
    <View style={[styles.search, { backgroundColor: palette.raised, borderColor: palette.border }]}>
      <Ionicons name="search" size={20} color={palette.muted} />
      <TextInput value={query} onChangeText={setQuery} placeholder={t('search_quran_audio_hint')} placeholderTextColor={palette.muted} autoCapitalize="none" style={[styles.input, { color: palette.text, textAlign: isRTL ? 'right' : 'left', fontFamily: locale === 'am' || locale === 'ar' ? undefined : 'Inter' }]} />
    </View>
    <AppText style={{ color: palette.muted, fontSize: 12 }}>{results.length} {t('episode_label')}</AppText>
    {results.map(track => <AudioRow key={track.id} track={track} active={audio.currentTrack?.id === track.id} onPlay={() => void playTrack(track)} onMore={() => setDetailsTrack(track)} />)}
    {!results.length ? <AppText style={{ color: palette.muted, textAlign: 'center', marginTop: 50 }}>{t('no_quran_audio_search_results_message')}</AppText> : null}
    <QuranEpisodeDetailsSheet track={detailsTrack} visible={detailsTrack !== null} onClose={() => setDetailsTrack(null)} />
  </Screen>;
}
const styles = StyleSheet.create({ search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 }, input: { minHeight: 50, flex: 1, fontFamily: 'Inter', fontSize: 14 } });
