import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import { AppText } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useAudio } from '@/app/providers/AudioProvider';
import { QuranArtwork } from '@/features/quran/components/QuranArtwork';
import { useLocalization } from '@/localization/LocalizationProvider';
import type { QuranChapter } from '@/features/quran/models/QuranAudio';
import { parseChapters } from '@/features/chapters/chapterMetadata';
import { writeCachedChapters } from '@/storage/database';
import { PlayerOptionsSheet } from './PlayerOptionsSheet';

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatSleepTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

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

function formatChapterTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const sleepOptions = [5, 10, 15, 30, 45, 60];
type DetailTab = 'chapters' | 'episode' | 'notes';

export default function PlayerScreen() {
  const palette = usePalette();
  const { t, isRTL } = useLocalization();
  const navigation = useNavigation<any>();
  const audio = useAudio();
  const [sleepSelectorVisible, setSleepSelectorVisible] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('episode');
  const [loadedChapters, setLoadedChapters] = useState<QuranChapter[]>([]);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const track = audio.currentTrack;

  useEffect(() => {
    setDetailTab('episode');
  }, [track?.id]);

  const chapters = track?.chapters?.length ? track.chapters : loadedChapters;
  const hasChapters = Boolean(track?.chapters?.length || track?.chaptersUrl || loadedChapters.length);
  const notes = useMemo(() => htmlToReadableText(track?.description ?? ''), [track?.description]);
  const detailTabs: { key: DetailTab; label: string }[] = [
    ...(hasChapters ? [{ key: 'chapters' as const, label: t('chapters_label') }] : []),
    { key: 'episode', label: t('episode_label') },
    { key: 'notes', label: t('notes_label') },
  ];

  useEffect(() => {
    if (!hasChapters && detailTab === 'chapters') setDetailTab('episode');
  }, [hasChapters, detailTab]);

  useEffect(() => {
    setLoadedChapters(track?.chapters ?? []);
    setChapterError(null);
  }, [track?.id]);

  useEffect(() => {
    if (detailTab !== 'chapters' || !track?.chaptersUrl || track.chapters?.length || loadedChapters.length) return;
    let active = true;
    setChapterLoading(true);
    setChapterError(null);
    fetch(track.chaptersUrl, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Chapter metadata returned HTTP ${response.status}.`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        const parsed = parseChapters(payload);
        if (!active) return;
        setLoadedChapters(parsed);
        if (parsed.length) void writeCachedChapters(track.id, parsed).catch((error: unknown) => {
          console.warn('Player chapter metadata could not be cached.', error);
        });
      })
      .catch((error: unknown) => {
        if (active) setChapterError(error instanceof Error ? error.message : 'Could not load chapter metadata.');
      })
      .finally(() => {
        if (active) setChapterLoading(false);
      });
    return () => { active = false; };
  }, [detailTab, track?.id, track?.chaptersUrl, track?.chapters, loadedChapters.length]);

  if (!track) {
    return <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.empty}><AppText>{t('no_downloads_message')}</AppText></View>
    </SafeAreaView>;
  }

  const activeChapterIndex = chapters.findIndex((chapter, index) => (
    audio.positionSeconds >= chapter.startSeconds &&
    (chapters[index + 1] ? audio.positionSeconds < chapters[index + 1].startSeconds : true)
  ));

  return <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: palette.background, direction: isRTL ? 'rtl' : 'ltr' }]}>
    <View style={styles.page}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('minimise_player_window_button_label')} onPress={() => navigation.goBack()} hitSlop={10} style={styles.topButton}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-down'} size={27} color={palette.text} />
        </Pressable>
        <View style={styles.detailTabs} accessibilityRole="tablist">
          {detailTabs.map((tab) => {
            const selected = detailTab === tab.key;
            return <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setDetailTab(tab.key)}
              style={[styles.detailTab, { borderBottomColor: selected ? '#0066CC' : 'transparent' }]}
            >
              <AppText style={[styles.detailTabLabel, { color: selected ? palette.text : palette.muted }]}>{tab.label}</AppText>
            </Pressable>;
          })}
        </View>
        <View style={styles.topButton} />
      </View>

      <View style={[styles.mainContent, isLandscape && styles.mainContentLandscape]}>
      <View style={isLandscape ? styles.playerColumnLandscape : styles.playerColumn}>
      <View style={[styles.detailPanel, isLandscape && styles.detailPanelLandscape, { backgroundColor: palette.background }]}>
        {detailTab === 'episode' ? <View style={styles.episodePanel}>
          <QuranArtwork uri={(activeChapterIndex >= 0 ? chapters[activeChapterIndex]?.imageUrl : null) || track.imageUrl} style={styles.art} />
          <View style={styles.meta}>
            <AppText numberOfLines={3} style={styles.title}>{track.title}</AppText>
            <AppText style={{ color: palette.muted, fontSize: 14 }}>{track.artist}</AppText>
            {activeChapterIndex >= 0 ? <AppText numberOfLines={2} style={{ color: palette.muted, fontSize: 12, textAlign: 'center' }}>{chapters[activeChapterIndex].title}</AppText> : null}
          </View>
        </View> : null}

        {detailTab === 'chapters' ? <ScrollView contentContainerStyle={styles.chapterList}>
          {chapterLoading ? <View style={styles.chapterEmpty}><AppText style={{ color: palette.muted }}>{t('semantic_announce_loading')}</AppText></View> : null}
          {chapterError ? <View style={styles.chapterEmpty}><AppText style={{ color: palette.muted, textAlign: 'center' }}>{chapterError}</AppText><Pressable onPress={() => navigation.navigate('Chapters')} style={styles.openDetailsButton}><AppText style={{ color: '#0066CC' }}>{t('chapters_label')}</AppText></Pressable></View> : null}
          {chapters.length ? chapters.map((chapter: QuranChapter, index: number) => {
            const active = index === activeChapterIndex;
            return <Pressable key={`${chapter.startSeconds}-${index}`} onPress={() => audio.seek(chapter.startSeconds)} style={[styles.chapterRow, { borderBottomColor: palette.border, backgroundColor: active ? palette.raised : 'transparent' }]}>
              <View style={[styles.chapterNumber, { backgroundColor: active ? '#0066CC' : palette.raised }]}>
                <AppText style={{ color: active ? '#FFFFFF' : palette.muted, fontFamily: 'Inter-Bold', fontSize: 12 }}>{index + 1}</AppText>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText style={{ fontFamily: 'Inter-Medium', fontSize: 13 }}>{chapter.title}</AppText>
                <AppText style={{ color: palette.muted, fontSize: 11 }}>{formatChapterTime(chapter.startSeconds)}</AppText>
              </View>
              <Ionicons name="play-circle-outline" size={21} color={active ? '#0066CC' : palette.muted} />
            </Pressable>;
          }) : !chapterLoading && !chapterError ? <View style={styles.chapterEmpty}>
            <AppText style={{ color: palette.muted, textAlign: 'center' }}>{t('no_transcript_available_label')}</AppText>
          </View> : null}
        </ScrollView> : null}

        {detailTab === 'notes' ? <ScrollView contentContainerStyle={styles.notesPanel}>
          <AppText style={{ fontFamily: 'Inter-Bold', fontSize: 18, marginBottom: 10 }}>{track.title}</AppText>
          {notes ? <AppText style={{ color: palette.text, fontSize: 14, lineHeight: 22 }}>{notes}</AppText> : <View style={styles.chapterEmpty}><AppText style={{ color: palette.muted, textAlign: 'center' }}>{t('no_transcript_available_label')}</AppText><Pressable onPress={() => navigation.navigate('ShowNotes')}><AppText style={{ color: '#0066CC' }}>{t('notes_label')}</AppText></Pressable></View>}
        </ScrollView> : null}
      </View>

      {audio.isLoading ? <AppText style={{ color: palette.muted, textAlign: 'center', fontSize: 12 }}>{t('semantic_announce_loading')}</AppText> : null}
      {audio.playbackError ? <View accessibilityRole="alert" style={[styles.errorNotice, { backgroundColor: palette.raised }]}><Ionicons name="alert-circle-outline" size={17} color="#D97706" /><AppText style={{ color: palette.text, flex: 1, fontSize: 12 }}>{audio.playbackError}</AppText></View> : null}

      <View style={[styles.transport, isLandscape && styles.transportLandscape]}>
        <View style={styles.progress}>
          <Slider value={Math.min(audio.positionSeconds, audio.durationSeconds || 0)} minimumValue={0} maximumValue={Math.max(1, audio.durationSeconds)} onSlidingComplete={audio.seek} minimumTrackTintColor="#0066CC" maximumTrackTintColor={palette.border} thumbTintColor="#0066CC" />
          <View style={styles.times}><AppText style={{ color: palette.muted, fontSize: 11 }}>{formatTime(audio.positionSeconds)}</AppText><AppText style={{ color: palette.muted, fontSize: 11 }}>{formatTime(audio.durationSeconds)}</AppText></View>
        </View>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('previous_track_label')} onPress={audio.previous}><Ionicons name="play-skip-back" size={26} color={palette.text} /></Pressable>
          <Pressable accessibilityLabel={t('rewind_button_label')} onPress={audio.rewind}><Ionicons name="play-back" size={23} color={palette.text} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t(audio.isPlaying ? 'pause_button_label' : 'play_button_label')} onPress={audio.togglePlayback} style={[styles.playButton, isLandscape && styles.playButtonLandscape]}><Ionicons name={audio.isPlaying ? 'pause' : 'play'} size={31} color="#FFFFFF" /></Pressable>
          <Pressable accessibilityLabel={t('fast_forward_button_label')} onPress={audio.fastForward}><Ionicons name="play-forward" size={23} color={palette.text} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('next_track_label')} onPress={audio.next}><Ionicons name="play-skip-forward" size={26} color={palette.text} /></Pressable>
        </View>
        <View style={styles.extraControls}>
          <Pressable onPress={() => setSleepSelectorVisible(true)} style={styles.extraAction} accessibilityRole="button" accessibilityLabel={t('sleep_timer_label')}>
            <Ionicons name={audio.sleepTimer.mode === 'off' ? 'moon-outline' : 'moon'} size={18} color={audio.sleepTimer.mode === 'off' ? palette.muted : '#0066CC'} />
            <AppText style={{ color: audio.sleepTimer.mode === 'off' ? palette.muted : '#0066CC', fontSize: 11 }}>{audio.sleepTimer.mode === 'time' ? formatSleepTime(audio.sleepRemainingSeconds) : audio.sleepTimer.mode === 'episode' ? t('sleep_episode_label') : t('sleep_timer_label')}</AppText>
          </Pressable>
          <Pressable onPress={() => audio.setRate(audio.playbackRate >= 2 ? 0.5 : Math.min(2, Math.round((audio.playbackRate + 0.1) * 10) / 10))} style={styles.extraAction}>
            <AppText style={{ color: palette.muted, fontFamily: 'Inter-Bold' }}>{audio.playbackRate.toFixed(1)}×</AppText>
            <AppText style={{ color: palette.muted, fontSize: 11 }}>{t('playback_speed_label')}</AppText>
          </Pressable>
        </View>
      </View>
      </View>
      {isLandscape ? <PlayerOptionsSheet wide /> : null}
      </View>

      {!isLandscape ? <PlayerOptionsSheet /> : null}
    </View>

    <Modal transparent animationType="slide" visible={sleepSelectorVisible} onRequestClose={() => setSleepSelectorVisible(false)}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSleepSelectorVisible(false)} accessibilityLabel={t('cancel_button_label')} />
        <View style={[styles.modalSheet, { backgroundColor: palette.surface }]}>
          <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
          <AppText style={styles.sheetTitle}>{t('sleep_timer_label')}</AppText>
          <AppText style={{ color: palette.muted, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
            {audio.sleepTimer.mode === 'time' ? `${t('sleep_timer_label')}: ${formatSleepTime(audio.sleepRemainingSeconds)}` : audio.sleepTimer.mode === 'episode' ? t('sleep_episode_label') : t('sleep_off_label')}
          </AppText>
          <Pressable onPress={() => { audio.setSleepTimer('off'); setSleepSelectorVisible(false); }} style={[styles.sleepOption, { borderBottomColor: palette.border }]} accessibilityRole="button" accessibilityState={{ selected: audio.sleepTimer.mode === 'off' }}>
            <AppText style={styles.sleepOptionText}>{t('sleep_off_label')}</AppText>
            {audio.sleepTimer.mode === 'off' ? <Ionicons name="checkmark" color="#0066CC" size={20} /> : null}
          </Pressable>
          {sleepOptions.map((minutes) => (
            <Pressable key={minutes} onPress={() => { audio.setSleepTimer('time', minutes); setSleepSelectorVisible(false); }} style={[styles.sleepOption, { borderBottomColor: palette.border }]} accessibilityRole="button" accessibilityLabel={t('sleep_minute_label', { minutes })}>
              <AppText style={styles.sleepOptionText}>{t('sleep_minute_label', { minutes })}</AppText>
              {audio.sleepTimer.mode === 'time' && audio.sleepTimer.durationMinutes === minutes ? <Ionicons name="checkmark" color="#0066CC" size={20} /> : null}
            </Pressable>
          ))}
          <Pressable onPress={() => { audio.setSleepTimer('episode'); setSleepSelectorVisible(false); }} style={[styles.sleepOption, { borderBottomColor: palette.border }]} accessibilityRole="button" accessibilityState={{ selected: audio.sleepTimer.mode === 'episode' }}>
            <AppText style={styles.sleepOptionText}>{t('sleep_episode_label')}</AppText>
            {audio.sleepTimer.mode === 'episode' ? <Ionicons name="checkmark" color="#0066CC" size={20} /> : null}
          </Pressable>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 2 },
  mainContent: { flex: 1, minHeight: 0 },
  mainContentLandscape: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  playerColumn: { flex: 1, minHeight: 0 },
  playerColumnLandscape: { flex: 1, minWidth: 0, minHeight: 0 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  topButton: { width: 32, alignItems: 'center', justifyContent: 'center' },
  detailTabs: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignSelf: 'stretch' },
  detailTab: { minWidth: 74, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2 },
  detailTabLabel: { fontFamily: 'Inter-Medium', fontSize: 12 },
  detailPanel: { flex: 1, minHeight: 190, maxHeight: '53%' },
  detailPanelLandscape: { flex: 6, minHeight: 0, maxHeight: '100%' },
  episodePanel: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: 5 },
  art: { width: '75%', maxWidth: 330, aspectRatio: 1, borderRadius: 7 },
  meta: { alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingTop: 8 },
  title: { fontFamily: 'Inter-Bold', fontSize: 21, lineHeight: 27, textAlign: 'center' },
  chapterList: { paddingVertical: 6, paddingHorizontal: 3 },
  chapterRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 9 },
  chapterNumber: { width: 31, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chapterEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 18 },
  openDetailsButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7 },
  notesPanel: { padding: 12, paddingBottom: 20 },
  progress: { paddingTop: 3 },
  times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  transport: { paddingTop: 4, paddingBottom: 8 },
  transportLandscape: { justifyContent: 'center', minWidth: 0, paddingBottom: 6 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 7, marginBottom: 4 },
  playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  playButtonLandscape: { width: 52, height: 52, borderRadius: 26 },
  extraControls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingTop: 4 },
  extraAction: { minWidth: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 5 },
  errorNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 28 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontFamily: 'Inter-Bold', fontSize: 18, textAlign: 'center', marginBottom: 5 },
  sleepOption: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sleepOptionText: { fontSize: 14, fontFamily: 'Inter-Medium' },
});
