import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { isAudioDownloaded, type QuranAudio } from '../models/QuranAudio';
import { radius } from '@/tds/tokens';
import type { AudioDownloadProgress } from '@/features/quran/services/audioDownloadManager';
import { useLocalization } from '@/localization/LocalizationProvider';
import { formatAudioBytes } from '../services/formatAudioBytes';

export function AudioRow({ track, onPlay, onMore, onDownload, onCancelDownload, downloadProgress, isNew = false, active = false }: {
  track: QuranAudio;
  onPlay: () => void;
  onMore?: () => void;
  onDownload?: () => void;
  onCancelDownload?: () => void;
  downloadProgress?: AudioDownloadProgress;
  isNew?: boolean;
  active?: boolean;
}) {
  const palette = usePalette();
  const { t, isRTL } = useLocalization();
  return <View style={[styles.row, { borderBottomColor: palette.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
    <Pressable onPress={onPlay} accessibilityRole="button" accessibilityLabel={`${t('play_button_label')} ${track.title}`} style={styles.playIcon}>
      <Ionicons name={active ? 'volume-high' : 'play'} size={18} color="#FFFFFF" />
    </Pressable>
    <Pressable onPress={onPlay} style={styles.info}>
      <View style={[styles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><AppText numberOfLines={1} style={[styles.title, { color: palette.text }]}>{track.title}</AppText>{isNew ? <View style={styles.newBadge}><AppText style={styles.newBadgeText}>{t('new_badge_label')}</AppText></View> : null}</View>
      <AppText numberOfLines={1} style={[styles.subtitle, { color: palette.muted }]}>
        {track.artist} · {isAudioDownloaded(track) ? (track.sizeBytes > 0 ? formatAudioBytes(track.sizeBytes) : t('available_offline_label')) : downloadProgress?.state === 'paused' ? t('download_paused_label') : downloadProgress ? t('download_progress_message') : t('stream_download_message')}
      </AppText>
      {downloadProgress ? <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
          <View style={[styles.progressFill, { width: `${downloadProgress.percent ?? 12}%` }]} />
        </View>
        <AppText style={[styles.progressLabel, { color: palette.muted }]}>{downloadProgress.state === 'paused' ? t('download_paused_label') : downloadProgress.percent === null ? formatAudioBytes(downloadProgress.bytesWritten) : `${downloadProgress.percent}%`}</AppText>
      </View> : null}
    </Pressable>
    {downloadProgress ? <Pressable onPress={onCancelDownload} accessibilityRole="button" accessibilityLabel={`${t('cancel_button_label')} ${track.title}`} style={styles.action}>
      <Ionicons name="close-circle-outline" size={21} color={palette.muted} />
    </Pressable> : onDownload && !isAudioDownloaded(track) ? <Pressable onPress={onDownload} accessibilityRole="button" accessibilityLabel={`Download ${track.title}`} style={styles.action}>
      <Ionicons name="cloud-download-outline" size={19} color="#0066CC" />
    </Pressable> : null}
    {onMore ? <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={t('label_episode_actions')} style={styles.action}>
      <Ionicons name="ellipsis-vertical" size={19} color={palette.muted} />
    </Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  playIcon: { width: 38, height: 38, backgroundColor: '#0066CC', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 14 },
  newBadge: { backgroundColor: 'rgba(0,102,204,0.12)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  newBadgeText: { color: '#0066CC', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.3 },
  subtitle: { fontFamily: 'Inter', fontSize: 11 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  progressTrack: { flex: 1, height: 3, overflow: 'hidden', borderRadius: 2 },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: '#0066CC' },
  progressLabel: { width: 42, fontFamily: 'Inter-Medium', fontSize: 9, textAlign: 'right' },
  action: { minWidth: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
