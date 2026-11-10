import React, { useMemo } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/tds/components/Text';
import { Surface } from '@/tds/components/Surface';
import { usePalette } from '@/tds/theme';
import { useLocalization } from '@/localization/LocalizationProvider';
import { useAudio } from '@/app/providers/AudioProvider';
import { usePlayQuranTrack } from '@/app/hooks/usePlayQuranTrack';
import { useQuranLibrary } from '../state/QuranLibraryProvider';
import { isAudioDownloaded, type QuranAudio } from '../models/QuranAudio';
import { QuranArtwork } from './QuranArtwork';
import { formatAudioBytes } from '../services/formatAudioBytes';
import { buildEpisodeShareMessage } from '../services/episodeShare';
import { htmlToReadableText } from '../services/episodeDescription';
import type { AudioDownloadProgress } from '../services/audioDownloadManager';

type Props = {
  track: QuranAudio | null;
  visible: boolean;
  onClose: () => void;
};

type ActionProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

function DetailAction({ icon, label, onPress, disabled = false, destructive = false }: ActionProps) {
  const palette = usePalette();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.action, { borderColor: palette.border, backgroundColor: palette.raised, opacity: disabled ? 0.42 : pressed ? 0.68 : 1 }]}
  >
    <Ionicons name={icon} size={19} color={destructive ? '#D94A4A' : palette.text} />
    <AppText numberOfLines={2} style={[styles.actionText, { color: destructive ? '#D94A4A' : palette.text }]}>{label}</AppText>
  </Pressable>;
}

function formatDuration(milliseconds: number): string | null {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function QuranEpisodeDetailsSheet({ track, visible, onClose }: Props) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { t, locale, isRTL } = useLocalization();
  const { tracks, downloadedTracks, downloadTrack, downloadProgress, cancelDownload, removeTrack, setTrackPlayed } = useQuranLibrary();
  const audio = useAudio();
  const playTrack = usePlayQuranTrack();
  const liveTrack = track ? tracks.find((item) => item.id === track.id) ?? downloadedTracks.find((item) => item.id === track.id) ?? track : null;
  const description = useMemo(() => htmlToReadableText(liveTrack?.description ?? ''), [liveTrack?.description]);
  const queued = Boolean(liveTrack && audio.queue.some((item) => item.id === liveTrack.id));
  const current = Boolean(liveTrack && audio.currentTrack?.id === liveTrack.id);
  const downloaded = liveTrack ? isAudioDownloaded(liveTrack) : false;
  const progress: AudioDownloadProgress | undefined = liveTrack ? downloadProgress[liveTrack.id] : undefined;
  const duration = liveTrack ? formatDuration(liveTrack.durationMs) : null;
  const published = useMemo(() => {
    if (!liveTrack?.publishedAt) return null;
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(liveTrack.publishedAt));
    } catch {
      return new Date(liveTrack.publishedAt).toLocaleDateString();
    }
  }, [locale, liveTrack?.publishedAt]);

  const confirmDelete = () => {
    if (!liveTrack) return;
    Alert.alert(t('delete_episode_title'), t('delete_episode_confirmation'), [
      { text: t('cancel_button_label'), style: 'cancel' },
      {
        text: t('delete_button_label'),
        style: 'destructive',
        onPress: () => {
          onClose();
          void removeTrack(liveTrack);
        },
      },
    ]);
  };

  const shareTrack = async () => {
    if (!liveTrack) return;
    try {
      await Share.share({ message: buildEpisodeShareMessage(liveTrack), title: liveTrack.title });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('share_episode_option_label');
      Alert.alert(t('error_label'), message);
    }
  };

  if (!liveTrack) return null;
  const detailTrack = liveTrack;

  const direction = isRTL ? 'row-reverse' : 'row';
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.modalRoot}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('close_button_label')} onPress={onClose} style={StyleSheet.absoluteFill} />
      <Surface style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border, paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={[styles.handleRow, { direction: 'ltr' }]}><View style={[styles.handle, { backgroundColor: palette.border }]} /></View>
        <View style={[styles.sheetHeader, { flexDirection: direction }]}>
          <QuranArtwork uri={detailTrack.imageUrl} style={styles.artwork} />
          <View style={styles.headerMeta}>
            <AppText numberOfLines={3} style={styles.title}>{detailTrack.title}</AppText>
            <AppText style={{ color: palette.muted, fontSize: 12 }}>{detailTrack.artist}</AppText>
            <AppText style={{ color: palette.muted, fontSize: 11 }}>
              {[duration, published, downloaded ? t('available_offline_label') : null].filter(Boolean).join(' · ')}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('play_button_label')} onPress={() => { onClose(); if (current) audio.togglePlayback(); else void playTrack(detailTrack); }} style={styles.playButton}>
            <Ionicons name={current && audio.isPlaying ? 'pause' : 'play'} size={21} color="#FFFFFF" />
          </Pressable>
        </View>
        {progress ? <View style={styles.progressLine}>
          <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
            <View style={[styles.progressFill, { width: `${progress.percent ?? 8}%` }]} />
          </View>
          <AppText style={{ fontSize: 10, color: palette.muted }}>{progress.state === 'paused' ? t('download_paused_label') : progress.percent === null ? formatAudioBytes(progress.bytesWritten) : `${progress.percent}%`}</AppText>
        </View> : null}
        <View style={[styles.actions, { flexDirection: direction }]}>
          <DetailAction icon={queued ? 'checkmark-done-outline' : 'list-outline'} label={t(queued ? 'queue_remove_label' : 'queue_add_label')} disabled={current} onPress={() => {
            if (queued) audio.removeFromQueue(detailTrack.id);
            else audio.addToQueue(detailTrack);
          }} />
          <DetailAction icon={detailTrack.isPlayed ? 'eye-off-outline' : 'checkmark-circle-outline'} label={t(detailTrack.isPlayed ? 'mark_unplayed_label' : 'mark_played_label')} onPress={() => void setTrackPlayed(detailTrack.id, !detailTrack.isPlayed)} />
          {progress ? <DetailAction icon="close-circle-outline" label={t('cancel_button_label')} destructive onPress={() => cancelDownload(detailTrack.id)} />
            : downloaded ? <DetailAction icon="trash-outline" label={t('delete_episode_button_label')} destructive onPress={confirmDelete} />
              : detailTrack.sourceType === 'featured-google-drive' ? <DetailAction icon="cloud-download-outline" label={t('download_episode_button_label')} onPress={() => void downloadTrack(detailTrack)} /> : null}
          {detailTrack.sourceGuid ? <DetailAction icon="share-outline" label={t('share_episode_option_label')} onPress={() => void shareTrack()} /> : null}
        </View>
        <ScrollView style={styles.descriptionScroll} contentContainerStyle={styles.descriptionContent} showsVerticalScrollIndicator={false}>
          <AppText style={styles.descriptionTitle}>{detailTrack.title}</AppText>
          {description ? <AppText style={[styles.description, { color: palette.text, textAlign: isRTL ? 'right' : 'left' }]}>{description}</AppText>
            : <AppText style={{ color: palette.muted, fontSize: 13 }}>{t('no_episode_description_label')}</AppText>}
        </ScrollView>
      </Surface>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { maxHeight: '88%', minHeight: '46%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 8, gap: 13 },
  handleRow: { alignItems: 'center', paddingVertical: 2 },
  handle: { width: 38, height: 4, borderRadius: 3 },
  sheetHeader: { alignItems: 'center', gap: 12 },
  artwork: { width: 76, height: 76, borderRadius: 13 },
  headerMeta: { flex: 1, gap: 5 },
  title: { fontFamily: 'Inter-Bold', fontSize: 16, lineHeight: 21 },
  playButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0066CC' },
  progressLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: '#0066CC' },
  actions: { alignItems: 'stretch', gap: 8, flexWrap: 'wrap' },
  action: { flexGrow: 1, flexBasis: '21%', minWidth: 66, minHeight: 66, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 7, gap: 5 },
  actionText: { fontFamily: 'Inter-Medium', fontSize: 9, textAlign: 'center' },
  descriptionScroll: { flexGrow: 0, flexShrink: 1, minHeight: 100 },
  descriptionContent: { paddingTop: 2, paddingBottom: 14, gap: 10 },
  descriptionTitle: { fontFamily: 'Inter-Bold', fontSize: 17, lineHeight: 22 },
  description: { fontFamily: 'Inter', fontSize: 13, lineHeight: 22 },
});
