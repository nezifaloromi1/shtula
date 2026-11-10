import React, { useState } from 'react';
import { Alert, Share, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { ActionButton } from '@/shared/components/ActionButton';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import { AudioRow } from '@/features/quran/components/AudioRow';
import { QuranArtwork } from '@/features/quran/components/QuranArtwork';
import { QuranEpisodeDetailsSheet } from '@/features/quran/components/QuranEpisodeDetailsSheet';
import { QuranCollectionActionsSheet } from '@/features/quran/components/QuranCollectionActionsSheet';
import { isAudioDownloaded, type QuranAudio } from '@/features/quran/models/QuranAudio';
import { useLocalization } from '@/localization/LocalizationProvider';
import { sortQuranTracks } from '@/features/quran/services/layoutPolicy';
import { usePlayQuranTrack } from '@/app/hooks/usePlayQuranTrack';
import { useAudio } from '@/app/providers/AudioProvider';
import { buildCollectionShareMessage } from '@/features/quran/services/episodeShare';
import { FEATURED_QURAN_FEED_URL } from '@/features/quran/services/featuredQuranFeed';
import feedConfig from '@/features/quran/config/feed.json';

export default function TafsiiraScreen() {
  const palette = usePalette();
  const { t, isRTL } = useLocalization();
  const {
    tracks,
    settings,
    newFeaturedTrackIds,
    downloadProgress,
    downloadTrack,
    cancelDownload,
    refreshFeed,
    feedLoading,
    feedError,
    setAllFeedTracksPlayed,
  } = useQuranLibrary();
  const playTrack = usePlayQuranTrack();
  const [detailsTrack, setDetailsTrack] = useState<QuranAudio | null>(null);
  const [collectionActionsVisible, setCollectionActionsVisible] = useState(false);
  const audio = useAudio();
  const feedTracks = tracks.filter((track) => track.sourceType === 'featured-google-drive');
  const sortedFeedTracks = sortQuranTracks(feedTracks, settings.layoutOrder);
  const unplayedCount = feedTracks.filter((track) => !track.isPlayed).length;
  const newCount = feedTracks.filter((track) => newFeaturedTrackIds.includes(track.id)).length;

  const playAll = () => {
    if (sortedFeedTracks[0]) void playTrack(sortedFeedTracks[0]);
  };

  const showActions = (track: QuranAudio) => setDetailsTrack(track);

  const shuffle = () => {
    if (sortedFeedTracks.length) {
      const randomIndex = Math.floor(Math.random() * sortedFeedTracks.length);
      void playTrack(sortedFeedTracks[randomIndex]);
    }
  };

  const updateAllPlayedState = async (played: boolean) => {
    try {
      await setAllFeedTracksPlayed(played);
      setCollectionActionsVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('error_label');
      Alert.alert(t('error_label'), message);
    }
  };

  const shareCollection = async () => {
    setCollectionActionsVisible(false);
    try {
      await Share.share({
        message: buildCollectionShareMessage(feedConfig.artist, FEATURED_QURAN_FEED_URL),
        title: feedConfig.artist,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('share_quran_collection_label');
      Alert.alert(t('error_label'), message);
    }
  };

  const renderGridTrack = (track: QuranAudio) => {
    const progress = downloadProgress[track.id];
    const isNew = settings.layoutHighlight && newFeaturedTrackIds.includes(track.id);
    const compact = settings.layoutMode === 1;
    return <View key={track.id} style={[styles.gridCard, { flexBasis: compact ? '31%' : '47%' }]}>
      <Pressable onPress={() => void playTrack(track)} accessibilityRole="button" accessibilityLabel={`${t('play_button_label')} ${track.title}`}>
        <View style={styles.gridArtworkWrap}>
          <QuranArtwork uri={track.imageUrl} style={styles.gridArtwork} />
          <View style={styles.gridPlay}><Ionicons name="play" size={compact ? 15 : 19} color="#FFFFFF" /></View>
          {isNew ? <View style={styles.gridNewBadge}><AppText style={styles.gridNewBadgeText}>{t('new_badge_label')}</AppText></View> : null}
        </View>
        <AppText numberOfLines={compact ? 2 : 3} style={[styles.gridTitle, compact && styles.gridTitleCompact]}>{track.title}</AppText>
      </Pressable>
      {progress ? <View style={[styles.gridProgressTrack, { backgroundColor: palette.border }]}><View style={[styles.gridProgressFill, { width: `${progress.percent ?? 12}%` }]} /></View> : null}
      <View style={[styles.gridActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable onPress={() => void playTrack(track)} accessibilityLabel={t('play_button_label')} style={styles.gridAction}><Ionicons name="play-circle-outline" size={20} color={palette.text} /></Pressable>
        {progress ? <Pressable onPress={() => cancelDownload(track.id)} accessibilityLabel={t('cancel_button_label')} style={styles.gridAction}><Ionicons name="close-circle-outline" size={20} color={palette.muted} /></Pressable>
          : !isAudioDownloaded(track) ? <Pressable onPress={() => void downloadTrack(track)} accessibilityLabel={t('download_episode_button_label')} style={styles.gridAction}><Ionicons name="cloud-download-outline" size={19} color={palette.muted} /></Pressable> : null}
        <Pressable onPress={() => showActions(track)} accessibilityLabel={t('label_episode_actions')} style={styles.gridAction}><Ionicons name="ellipsis-horizontal" size={20} color={palette.muted} /></Pressable>
      </View>
    </View>;
  };

  return <Screen>
    <TopBar title="Sheikh Aadam Tuulaa" />
    <View style={styles.collection}>
      <View style={[styles.collectionInfo, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <QuranArtwork uri={feedTracks[0]?.imageUrl} style={styles.art} />
        <View style={styles.details}>
          <AppText style={styles.title}>{t('tafsiira_label')}</AppText>
          <AppText style={[styles.sub, { color: palette.muted }]} numberOfLines={2}>Sheikh Aadam Tuulaa</AppText>
          {feedTracks.length > 0 && settings.layoutCount ? <AppText style={[styles.count, { color: palette.muted }]}>{t('unplayed_episode_count_label', { count: unplayedCount })}</AppText> : null}
          {settings.layoutHighlight && newCount > 0 ? <View style={styles.newCollectionBadge}><Ionicons name="sparkles" size={12} color="#0066CC" /><AppText style={styles.newCollectionText}>{t('new_episode_count_label', { count: newCount })}</AppText></View> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran_collection_options_label')}
          onPress={() => setCollectionActionsVisible(true)}
          style={({ pressed }) => [styles.collectionMenuButton, { borderColor: palette.border, opacity: pressed ? 0.68 : 1 }]}
        >
          <Ionicons name="ellipsis-horizontal" size={21} color={palette.text} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        <ActionButton title={t('play_all_label')} onPress={playAll} disabled={!sortedFeedTracks.length} style={styles.actionButton} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('shuffle_label')}
          onPress={shuffle}
          disabled={!sortedFeedTracks.length}
          style={({ pressed }) => [styles.shuffleButton, { borderColor: palette.border, opacity: sortedFeedTracks.length ? (pressed ? 0.72 : 1) : 0.45 }]}
        >
          <Ionicons name="shuffle" size={19} color={palette.text} />
          <AppText style={styles.shuffleLabel}>{t('shuffle_label')}</AppText>
        </Pressable>
      </View>
    </View>

    {feedTracks.length > 0 ? <View style={[styles.listHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <AppText style={textStyles.subheading}>{t('all_episodes_label')}</AppText>
      <AppText style={{ color: '#0066CC', fontFamily: 'Inter-Medium', fontSize: 14 }}>{feedTracks.length}</AppText>
    </View> : null}

    {feedError ? <View style={styles.errorState}>
      <Ionicons name="alert-circle-outline" size={50} color={palette.muted} />
      <AppText style={{ color: palette.text, textAlign: 'center' }}>{t('no_podcast_details_message')}</AppText>
      <Pressable onPress={() => void refreshFeed()} disabled={feedLoading} style={styles.retryButton}>
        <Ionicons name="refresh" size={17} color="#0066CC" />
        <AppText style={{ color: '#0066CC', fontFamily: 'Inter-Medium', fontSize: 13 }}>{t('refresh_feed_label')}</AppText>
      </Pressable>
    </View> : null}

    {feedTracks.length && settings.layoutMode === 0 ? sortedFeedTracks.map((track) => <AudioRow
      key={track.id}
      track={track}
      isNew={settings.layoutHighlight && newFeaturedTrackIds.includes(track.id)}
      onPlay={() => void playTrack(track)}
      onMore={() => showActions(track)}
      onDownload={() => void downloadTrack(track)}
      onCancelDownload={() => cancelDownload(track.id)}
      downloadProgress={downloadProgress[track.id]}
    />) : feedTracks.length ? <View style={[styles.grid, { direction: isRTL ? 'rtl' : 'ltr' }]}>{sortedFeedTracks.map(renderGridTrack)}</View>
      : feedLoading ? <View style={styles.emptyLoading}><ActivityIndicator color="#0066CC" /><AppText style={{ color: palette.muted, fontSize: 12 }}>{t('semantic_announce_loading')}</AppText></View>
      : !feedError ? <View style={styles.emptyState}><Ionicons name="headset" size={75} color="#0066CC" /><AppText style={{ color: palette.text, fontFamily: 'Inter-Medium', fontSize: 17, textAlign: 'center' }}>{t('no_subscriptions_message')}</AppText></View> : null}
    <QuranEpisodeDetailsSheet track={detailsTrack} visible={detailsTrack !== null} onClose={() => setDetailsTrack(null)} />
    <QuranCollectionActionsSheet
      visible={collectionActionsVisible}
      hasTracks={feedTracks.length > 0}
      refreshing={feedLoading}
      onClose={() => setCollectionActionsVisible(false)}
      onMarkAllPlayed={() => void updateAllPlayedState(true)}
      onMarkAllUnplayed={() => void updateAllPlayedState(false)}
      onRefresh={() => void refreshFeed()}
      onShare={() => void shareCollection()}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  collection: { paddingTop: 2, paddingBottom: 4, gap: 18 },
  collectionInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  art: { width: 148, height: 148, borderRadius: 18 },
  details: { flex: 1, justifyContent: 'center', gap: 7, paddingTop: 6 },
  collectionMenuButton: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  title: { fontFamily: 'Inter-Bold', fontSize: 22, lineHeight: 26 },
  sub: { fontFamily: 'Inter', fontSize: 13 },
  count: { fontFamily: 'Inter', fontSize: 11 },
  newCollectionBadge: { alignSelf: 'flex-start', borderRadius: 7, backgroundColor: 'rgba(0,102,204,0.12)', paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  newCollectionText: { color: '#0066CC', fontFamily: 'Inter-Medium', fontSize: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionButton: { flex: 1, minHeight: 52, borderRadius: 16, paddingHorizontal: 10 },
  shuffleButton: { flex: 1, minHeight: 52, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  shuffleLabel: { fontFamily: 'Inter-Medium', fontSize: 14 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2, paddingTop: 12, paddingBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 12 },
  gridCard: { minWidth: 0, flexGrow: 0, gap: 7 },
  gridArtworkWrap: { width: '100%', aspectRatio: 1, borderRadius: 13, overflow: 'hidden', position: 'relative' },
  gridArtwork: { width: '100%', height: '100%' },
  gridPlay: { position: 'absolute', right: 7, bottom: 7, width: 31, height: 31, borderRadius: 16, backgroundColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  gridNewBadge: { position: 'absolute', top: 7, left: 7, backgroundColor: '#0066CC', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  gridNewBadgeText: { color: '#FFFFFF', fontSize: 8, fontFamily: 'Inter-Bold' },
  gridTitle: { fontFamily: 'Inter-Medium', fontSize: 12, lineHeight: 16 },
  gridTitleCompact: { fontSize: 10, lineHeight: 13 },
  gridProgressTrack: { height: 3, overflow: 'hidden', borderRadius: 2 },
  gridProgressFill: { height: 3, backgroundColor: '#0066CC' },
  gridActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gridAction: { minWidth: 32, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  retryButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  errorState: { minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28 },
  emptyState: { minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28 },
  emptyLoading: { minHeight: 100, justifyContent: 'center', alignItems: 'center', gap: 10 },
});
