import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioRow } from '@/features/quran/components/AudioRow';
import { QuranArtwork } from '@/features/quran/components/QuranArtwork';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useAudio } from '@/app/providers/AudioProvider';
import { useLocalization } from '@/localization/LocalizationProvider';
import { TranscriptPanel } from '@/features/transcripts/TranscriptPanel';

const COLLAPSED_HEIGHT = 68;
type PanelTab = 'queue' | 'transcript';

export function PlayerOptionsSheet({ wide = false }: { wide?: boolean }) {
  const palette = usePalette();
  const { t, isRTL } = useLocalization();
  const audio = useAudio();
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = Math.max(320, Math.min(windowHeight - 112, 760));
  const [activeTab, setActiveTab] = useState<PanelTab>('queue');
  const [expanded, setExpanded] = useState(false);
  const animatedHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const currentHeight = useRef(COLLAPSED_HEIGHT);
  const dragStartHeight = useRef(COLLAPSED_HEIGHT);

  const animateTo = (target: number) => {
    currentHeight.current = target;
    setExpanded(target > COLLAPSED_HEIGHT + 1);
    Animated.spring(animatedHeight, {
      toValue: target,
      useNativeDriver: false,
      stiffness: 240,
      damping: 28,
      mass: 0.8,
    }).start();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => { dragStartHeight.current = currentHeight.current; },
    onPanResponderMove: (_event, gesture) => {
      const next = Math.max(COLLAPSED_HEIGHT, Math.min(maxHeight, dragStartHeight.current - gesture.dy));
      currentHeight.current = next;
      setExpanded(next > COLLAPSED_HEIGHT + 1);
      animatedHeight.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      const projected = currentHeight.current - gesture.vy * 180;
      const shouldExpand = gesture.vy < -0.45 || (Math.abs(gesture.vy) <= 0.45 && projected > (COLLAPSED_HEIGHT + maxHeight) / 2);
      animateTo(shouldExpand ? maxHeight : COLLAPSED_HEIGHT);
    },
    onPanResponderTerminate: () => animateTo(currentHeight.current > (COLLAPSED_HEIGHT + maxHeight) / 2 ? maxHeight : COLLAPSED_HEIGHT),
  }), [animatedHeight, maxHeight]);

  const selectTab = (tab: PanelTab) => {
    setActiveTab(tab);
    if (!wide && !expanded) animateTo(maxHeight);
  };

  const clearQueue = () => {
    if (!audio.queue.length) return;
    Alert.alert(t('queue_clear_label_title'), t('queue_clear_label'), [
      { text: t('cancel_button_label'), style: 'cancel' },
      { text: t('queue_clear_button_label'), style: 'destructive', onPress: audio.clearQueue },
    ]);
  };

  const moveQueueItem = (index: number, offset: number) => {
    const destination = index + offset;
    if (destination < 0 || destination >= audio.queue.length) return;
    const reordered = [...audio.queue];
    const [item] = reordered.splice(index, 1);
    reordered.splice(destination, 0, item);
    audio.reorderQueue(reordered);
  };

  const transcriptAvailable = Boolean(audio.currentTrack?.transcriptUrl);
  const tabBar = <View style={[styles.tabs, { borderBottomColor: wide || expanded ? palette.border : 'transparent', direction: isRTL ? 'rtl' : 'ltr' }]}>
    <Pressable onPress={() => selectTab('queue')} style={[styles.tab, { borderBottomColor: (wide || expanded) && activeTab === 'queue' ? '#0066CC' : 'transparent' }]} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'queue' }}>
      <AppText style={[styles.tabLabel, { color: activeTab === 'queue' ? palette.text : palette.muted }]}>{t('up_next_queue_label').toLocaleUpperCase()}</AppText>
    </Pressable>
    <Pressable disabled={!transcriptAvailable} onPress={() => selectTab('transcript')} style={[styles.tab, { borderBottomColor: (wide || expanded) && activeTab === 'transcript' ? '#0066CC' : 'transparent' }]} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'transcript', disabled: !transcriptAvailable }}>
      <AppText style={[styles.tabLabel, { color: transcriptAvailable ? (activeTab === 'transcript' ? palette.text : palette.muted) : palette.muted, opacity: transcriptAvailable ? 1 : 0.55 }]}>{t('transcript_label').toLocaleUpperCase()}</AppText>
    </Pressable>
  </View>;

  const queuePanel = <ScrollView contentContainerStyle={styles.queueContent} keyboardShouldPersistTaps="handled">
    <View style={[styles.sectionHeader, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <AppText style={textStyles.subheading}>{t('now_playing_queue_label')}</AppText>
      <AppText style={{ color: palette.muted, fontSize: 11 }}>{audio.currentTrack ? '1' : '0'}</AppText>
    </View>
    {audio.currentTrack ? <AudioRow track={audio.currentTrack} active onPlay={audio.togglePlayback} /> : <AppText style={{ color: palette.muted, paddingVertical: 10 }}>{t('no_downloads_message')}</AppText>}
    <View style={[styles.sectionHeader, { marginTop: 10, direction: isRTL ? 'rtl' : 'ltr' }]}>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
        <AppText style={textStyles.subheading}>{t('playing_next_queue_label')}</AppText>
        <AppText style={{ color: palette.muted, fontSize: 11 }}>({audio.queue.length})</AppText>
      </View>
      <Pressable onPress={clearQueue} disabled={!audio.queue.length} accessibilityRole="button" accessibilityState={{ disabled: !audio.queue.length }}>
        <AppText style={{ color: audio.queue.length ? '#0066CC' : palette.muted, fontFamily: 'Inter-Bold', fontSize: 11 }}>{t('clear_queue_button_label')}</AppText>
      </Pressable>
    </View>
    {audio.queue.map((track, index) => <View key={track.id} style={[styles.queueRow, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <View style={{ flex: 1 }}><AudioRow track={track} onPlay={() => void audio.playTrack(track, audio.queue.slice(index + 1))} /></View>
      <View style={styles.queueActions}>
        <Pressable onPress={() => moveQueueItem(index, -1)} disabled={index === 0} accessibilityLabel={t('move_queue_item_up_label')}><Ionicons name="chevron-up" size={18} color={index === 0 ? palette.border : palette.muted} /></Pressable>
        <Pressable onPress={() => moveQueueItem(index, 1)} disabled={index === audio.queue.length - 1} accessibilityLabel={t('move_queue_item_down_label')}><Ionicons name="chevron-down" size={18} color={index === audio.queue.length - 1 ? palette.border : palette.muted} /></Pressable>
        <Pressable onPress={() => audio.removeFromQueue(track.id)} accessibilityLabel={t('remove_from_queue_label')}><Ionicons name="close" size={18} color={palette.muted} /></Pressable>
      </View>
    </View>)}
    {!audio.queue.length ? <View style={[styles.emptyQueue, { backgroundColor: palette.raised, borderColor: palette.border }]}><AppText style={{ color: palette.muted, textAlign: 'center' }}>{t('empty_queue_message')}</AppText></View> : null}
  </ScrollView>;

  const content = <View style={styles.body}>
    {activeTab === 'queue' ? queuePanel : <TranscriptPanel compact={!wide} />}
  </View>;

  if (wide) {
    return <View style={[styles.wide, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {tabBar}
      {content}
    </View>;
  }

  return <>
    <Animated.View pointerEvents={expanded && audio.currentTrack ? 'auto' : 'none'} style={[styles.floatingPlayer, { bottom: animatedHeight, opacity: expanded && audio.currentTrack ? 1 : 0, backgroundColor: palette.background, direction: isRTL ? 'rtl' : 'ltr' }]}>
      {audio.currentTrack ? <>
        <QuranArtwork uri={audio.currentTrack.imageUrl} style={styles.floatingArtwork} />
        <View style={styles.floatingMeta}>
          <AppText numberOfLines={1} style={{ color: palette.text, fontFamily: 'Inter-Bold', fontSize: 12 }}>{audio.currentTrack.title}</AppText>
          <AppText numberOfLines={1} style={{ color: palette.muted, fontSize: 10 }}>{audio.currentTrack.artist}</AppText>
        </View>
        <Pressable onPress={audio.togglePlayback} accessibilityRole="button" accessibilityLabel={t(audio.isPlaying ? 'pause_button_label' : 'play_button_label')} style={styles.floatingPlay}>
          <Ionicons name={audio.isPlaying ? 'pause' : 'play'} size={21} color={palette.text} />
        </Pressable>
      </> : null}
    </Animated.View>
    <Animated.View style={[styles.sheet, { height: animatedHeight, backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View {...panResponder.panHandlers} style={styles.dragArea}>
        <Pressable
          onPress={() => animateTo(expanded ? COLLAPSED_HEIGHT : maxHeight)}
          accessibilityRole="button"
          accessibilityLabel={t(expanded ? 'semantic_playing_options_collapse_label' : 'semantic_playing_options_expand_label')}
          accessibilityState={{ expanded }}
          style={styles.handlePress}
        >
          <View style={[styles.handle, { backgroundColor: palette.muted }]} />
        </Pressable>
      </View>
      {tabBar}
      {expanded ? content : null}
    </Animated.View>
  </>;
}

const styles = StyleSheet.create({
  floatingPlayer: { position: 'absolute', left: -4, right: -4, height: 58, zIndex: 19, elevation: 19, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  floatingArtwork: { width: 40, height: 40, borderRadius: 6 },
  floatingMeta: { flex: 1, minWidth: 0, gap: 3 },
  floatingPlay: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: -16, right: -16, bottom: 0, zIndex: 20, elevation: 20, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  wide: { flex: 1, minWidth: 0, minHeight: 0, borderLeftWidth: StyleSheet.hairlineWidth },
  dragArea: { minHeight: 18, alignItems: 'center', justifyContent: 'center' },
  handlePress: { width: '100%', minHeight: 18, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 38, height: 4, borderRadius: 2, opacity: 0.7 },
  tabs: { minHeight: 44, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2 },
  tabLabel: { fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 0.5 },
  body: { flex: 1, minHeight: 0 },
  queueContent: { paddingHorizontal: 14, paddingBottom: 22 },
  sectionHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  queueActions: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 3 },
  emptyQueue: { marginTop: 12, borderRadius: 10, borderWidth: 1, padding: 20 },
});
