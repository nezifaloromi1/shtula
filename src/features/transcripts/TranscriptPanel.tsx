import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useAudio } from '@/app/providers/AudioProvider';
import { useLocalization } from '@/localization/LocalizationProvider';
import { formatTranscriptTime, type TranscriptCue } from './transcriptParser';
import { useTranscriptData } from './useTranscriptData';

export function TranscriptPanel({ compact = false }: { compact?: boolean }) {
  const palette = usePalette();
  const { t, locale, isRTL } = useLocalization();
  const { currentTrack, positionSeconds, seek } = useAudio();
  const { cues, plainText, loading, error } = useTranscriptData(currentTrack);
  const [query, setQuery] = useState('');
  const [followPlayback, setFollowPlayback] = useState(true);
  const listRef = useRef<FlatList<TranscriptCue>>(null);
  const lastAutoScrolledIndex = useRef(-1);

  useEffect(() => {
    setQuery('');
    setFollowPlayback(true);
    lastAutoScrolledIndex.current = -1;
  }, [currentTrack?.id]);

  const filteredCues = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? cues.filter((cue) => cue.text.toLocaleLowerCase().includes(normalized)) : cues;
  }, [cues, query]);

  const activeCueIndex = cues.findIndex((cue, index) => (
    positionSeconds >= cue.startSeconds && positionSeconds < (cues[index + 1]?.startSeconds ?? cue.endSeconds)
  ));

  useEffect(() => {
    if (!followPlayback || query.trim() || activeCueIndex < 0 || activeCueIndex === lastAutoScrolledIndex.current) return;
    const visibleIndex = filteredCues.findIndex((cue) => cue === cues[activeCueIndex]);
    if (visibleIndex < 0) return;
    lastAutoScrolledIndex.current = activeCueIndex;
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: visibleIndex, animated: true, viewPosition: 0.32 });
      } catch {
        // The list can still be measuring its rows; onScrollToIndexFailed retries below.
      }
    });
  }, [activeCueIndex, cues, filteredCues, followPlayback, query]);

  const renderCue = ({ item }: ListRenderItemInfo<TranscriptCue>) => {
    const originalIndex = cues.indexOf(item);
    const active = originalIndex === activeCueIndex;
    return <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatTranscriptTime(item.startSeconds)} ${item.text}`}
      onPress={() => seek(item.startSeconds)}
      style={[styles.cue, { backgroundColor: active ? palette.raised : 'transparent', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
    >
      <AppText style={{ color: '#0066CC', fontFamily: 'Inter-Bold', fontSize: 11, width: 44, textAlign: isRTL ? 'right' : 'left' }}>{formatTranscriptTime(item.startSeconds)}</AppText>
      <AppText style={{ color: palette.text, flex: 1, fontFamily: active ? 'Inter-Bold' : undefined, fontSize: compact ? 13 : 14, lineHeight: compact ? 21 : 23, textAlign: isRTL ? 'right' : 'left' }}>{item.text}</AppText>
    </Pressable>;
  };

  if (loading && !cues.length && !plainText) {
    return <View style={styles.state}><ActivityIndicator color="#0066CC" /><AppText style={{ color: palette.muted }}>{t('semantic_announce_loading')}</AppText></View>;
  }
  if (error && !cues.length && !plainText) {
    return <View style={styles.state}><Ionicons name="alert-circle-outline" size={26} color={palette.muted} /><AppText style={{ color: palette.muted, textAlign: 'center' }}>{error}</AppText></View>;
  }
  if (!cues.length && !plainText) {
    return <View style={styles.state}><Ionicons name="document-text-outline" size={compact ? 26 : 34} color={palette.muted} /><AppText style={textStyles.subheading}>{t('no_transcript_available_label')}</AppText></View>;
  }

  return <View style={styles.container}>
    {cues.length ? <>
      <View style={[styles.search, { backgroundColor: palette.raised, borderColor: palette.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Ionicons name="search" size={17} color={palette.muted} />
        <TextInput
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            if (value.trim()) setFollowPlayback(false);
          }}
          placeholder={t('search_transcript_label')}
          placeholderTextColor={palette.muted}
          returnKeyType="search"
          style={[styles.input, { color: palette.text, textAlign: isRTL ? 'right' : 'left', fontFamily: locale === 'am' || locale === 'ar' ? undefined : 'Inter' }]}
        />
        {query.length ? <Pressable onPress={() => { setQuery(''); setFollowPlayback(true); lastAutoScrolledIndex.current = -1; }} accessibilityRole="button" accessibilityLabel={t('clear_search_button_label')}>
          <Ionicons name="close-circle" size={18} color={palette.muted} />
        </Pressable> : null}
      </View>
      <View style={[styles.followRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <AppText style={{ color: palette.muted, fontSize: 11 }}>{t('auto_scroll_transcript_label')}</AppText>
        <Switch value={followPlayback} disabled={Boolean(query.trim())} onValueChange={setFollowPlayback} trackColor={{ true: '#0066CC' }} />
      </View>
      <FlatList
        ref={listRef}
        data={filteredCues}
        keyExtractor={(item, index) => `${item.startSeconds}-${index}`}
        renderItem={renderCue}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index), animated: true });
        }}
      />
    </> : <FlatList data={[plainText]} keyExtractor={(_, index) => String(index)} renderItem={({ item }) => <AppText style={{ color: palette.text, fontSize: compact ? 13 : 14, lineHeight: 23, textAlign: isRTL ? 'right' : 'left' }}>{item}</AppText>} contentContainerStyle={styles.plain} />}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  state: { flex: 1, minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  search: { minHeight: 42, borderRadius: 10, borderWidth: 1, alignItems: 'center', paddingHorizontal: 10, gap: 8, marginHorizontal: 12, marginTop: 8, marginBottom: 2 },
  input: { flex: 1, fontSize: 12, minHeight: 40, paddingVertical: 0 },
  followRow: { minHeight: 42, alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingHorizontal: 12 },
  list: { paddingHorizontal: 10, paddingBottom: 24, gap: 2 },
  cue: { alignItems: 'flex-start', paddingVertical: 9, paddingHorizontal: 7, borderRadius: 8, gap: 8 },
  plain: { padding: 14, paddingBottom: 28 },
});
