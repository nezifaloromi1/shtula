import React from 'react';
import { Alert, Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { AudioRow } from '@/features/quran/components/AudioRow';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useAudio } from '@/app/providers/AudioProvider';
import { usePlayQuranTrack } from '@/app/hooks/usePlayQuranTrack';
import { useLocalization } from '@/localization/LocalizationProvider';

export default function QueueScreen() {
  const palette = usePalette();
  const { t } = useLocalization();
  const audio = useAudio();
  const playTrack = usePlayQuranTrack();
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= audio.queue.length) return;
    const reordered = [...audio.queue];
    const [item] = reordered.splice(index, 1);
    reordered.splice(to, 0, item);
    audio.reorderQueue(reordered);
  };
  return <Screen>
    <TopBar title={t('up_next_queue_label')} />
    <View style={styles.header}><AppText style={textStyles.subheading}>{t('now_playing_queue_label')}</AppText><AppText style={{ color: palette.muted, fontSize: 12 }}>{audio.queue.length} queued</AppText></View>
    {audio.currentTrack ? <AudioRow track={audio.currentTrack} active onPlay={audio.togglePlayback} /> : <AppText style={{ color: palette.muted }}>{t('no_downloads_message')}</AppText>}
    <View style={styles.header}><AppText style={textStyles.subheading}>{t('up_next_queue_label')}</AppText><Pressable onPress={() => Alert.alert(t('queue_clear_label_title'), t('queue_clear_label'), [{ text: t('cancel_button_label'), style: 'cancel' }, { text: t('queue_clear_button_label'), style: 'destructive', onPress: audio.clearQueue }])}><AppText style={{ color: '#D64B4B', fontSize: 12, fontFamily: 'Inter-Medium' }}>{t('queue_clear_button_label')}</AppText></Pressable></View>
    {audio.queue.map((track, index) => <View key={track.id} style={styles.queueItem}>
      <View style={{ flex: 1 }}><AudioRow track={track} onPlay={() => void playTrack(track, audio.queue.slice(index + 1))} /></View>
      <View style={styles.reorder}><Pressable onPress={() => move(index, -1)}><Ionicons name="chevron-up" size={19} color={palette.muted} /></Pressable><Pressable onPress={() => move(index, 1)}><Ionicons name="chevron-down" size={19} color={palette.muted} /></Pressable><Pressable onPress={() => audio.removeFromQueue(track.id)}><Ionicons name="close" size={19} color={palette.muted} /></Pressable></View>
    </View>)}
    {!audio.queue.length ? <AppText style={{ color: palette.muted, textAlign: 'center', marginTop: 28 }}>{t('empty_queue_message')}</AppText> : null}
  </Screen>;
}
const styles = StyleSheet.create({ header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }, queueItem: { flexDirection: 'row', alignItems: 'center' }, reorder: { flexDirection: 'row', gap: 10, paddingHorizontal: 6 } });
