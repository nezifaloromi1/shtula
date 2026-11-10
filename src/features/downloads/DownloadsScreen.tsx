import React, { useState } from 'react';
import { Alert, Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { ActionButton } from '@/shared/components/ActionButton';
import { AudioRow } from '@/features/quran/components/AudioRow';
import { EmptyLibrary } from '@/shared/components/EmptyLibrary';
import { QuranEpisodeDetailsSheet } from '@/features/quran/components/QuranEpisodeDetailsSheet';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import { useAudio } from '@/app/providers/AudioProvider';
import { usePlayQuranTrack } from '@/app/hooks/usePlayQuranTrack';
import { useLocalization } from '@/localization/LocalizationProvider';
import type { QuranAudio } from '@/features/quran/models/QuranAudio';

export default function DownloadsScreen() {
  const palette = usePalette();
  const { t } = useLocalization();
  const { tracks, downloadedTracks, downloadProgress, cancelDownload, importAudio } = useQuranLibrary();
  const audio = useAudio();
  const playTrack = usePlayQuranTrack();
  const [detailsTrack, setDetailsTrack] = useState<QuranAudio | null>(null);
  const downloadingTracks = tracks.filter((track) => Boolean(downloadProgress[track.id]));
  return <Screen>
    <TopBar title={t('downloads')} />
    <View style={styles.headingRow}>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText style={textStyles.subheading}>{t('drive_library_label')}</AppText>
        <AppText style={{ color: palette.muted, fontSize: 12 }}>{t('home_no_quran_audio_message')}</AppText>
      </View>
      <View style={[styles.count, { backgroundColor: palette.raised }]}><AppText style={styles.countText}>{downloadedTracks.length}</AppText></View>
    </View>
    <ActionButton title={t('drive_download_button_label')} onPress={importAudio} />
    {downloadingTracks.length ? <View style={styles.downloadingSection}>
      <AppText style={textStyles.subheading}>{t('drive_downloading_message')}</AppText>
      {downloadingTracks.map((track) => <AudioRow key={track.id} track={track} active={audio.currentTrack?.id === track.id} onPlay={() => void playTrack(track)} downloadProgress={downloadProgress[track.id]} onCancelDownload={() => cancelDownload(track.id)} onMore={() => setDetailsTrack(track)} />)}
    </View> : null}
    {downloadedTracks.length ? downloadedTracks.map(track => <AudioRow key={track.id} track={track} active={audio.currentTrack?.id === track.id} onPlay={() => void playTrack(track)} onMore={() => setDetailsTrack(track)} />) : downloadingTracks.length === 0 ? <EmptyLibrary onImport={importAudio} /> : null}
    <QuranEpisodeDetailsSheet track={detailsTrack} visible={detailsTrack !== null} onClose={() => setDetailsTrack(null)} />
    <Pressable onPress={() => Alert.alert(t('offline_storage_title'), t('offline_storage_message')) } style={styles.info}>
      <Ionicons name="information-circle-outline" size={18} color={palette.muted} /><AppText style={{ color: palette.muted, fontSize: 12, flex: 1 }}>{t('drive_downloaded_message')}</AppText>
    </Pressable>
  </Screen>;
}
const styles = StyleSheet.create({ downloadingSection: { gap: 4, marginTop: 8 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, count: { borderRadius: 16, minWidth: 44, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }, countText: { fontFamily: 'Inter-Bold', fontSize: 16 }, info: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 } });
