import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useAudio } from '@/app/providers/AudioProvider';
import { writeCachedChapters } from '@/storage/database';
import type { QuranChapter } from '@/features/quran/models/QuranAudio';
import { useLocalization } from '@/localization/LocalizationProvider';
import { parseChapters } from './chapterMetadata';

type Chapter = QuranChapter;

function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export default function ChaptersScreen() {
  const palette = usePalette();
  const { t } = useLocalization();
  const { currentTrack, seek, positionSeconds } = useAudio();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setChapters(currentTrack?.chapters ?? []);
    setError(null);
    if (!currentTrack?.chaptersUrl) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    fetch(currentTrack.chaptersUrl, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Chapter metadata returned HTTP ${response.status}.`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        const parsed = parseChapters(payload);
        if (active) setChapters(parsed);
        if (parsed.length && currentTrack) void writeCachedChapters(currentTrack.id, parsed).catch((cacheError) => console.warn('Chapter cache could not be saved.', cacheError));
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load chapter metadata.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentTrack?.id, currentTrack?.chaptersUrl]);

  const activeIndex = chapters.findIndex((chapter, index) => positionSeconds >= chapter.startSeconds && (chapters[index + 1] ? positionSeconds < chapters[index + 1].startSeconds : true));
  return <Screen>
    <TopBar title={t('chapters_label')} />
    {loading ? <View style={styles.state}><ActivityIndicator color="#0066CC" /><AppText style={{ color: palette.muted }}>{t('semantic_announce_loading')}</AppText></View> : null}
    {error ? <View style={styles.state}><Ionicons name="alert-circle-outline" size={28} color={palette.muted} /><AppText style={{ color: palette.muted, textAlign: 'center' }}>{error}</AppText></View> : null}
    {!loading && !error && !chapters.length ? <View style={styles.state}>
      <Ionicons name="list-outline" size={34} color={palette.muted} />
      <AppText style={textStyles.subheading}>{t('episode_filter_no_episodes_title_label')}</AppText>
      <AppText style={[textStyles.body, { color: palette.muted, textAlign: 'center' }]}>{currentTrack ? t('episode_filter_no_episodes_title_description') : t('no_downloads_message')}</AppText>
    </View> : null}
    <ScrollView contentContainerStyle={styles.list}>
      {chapters.map((chapter, index) => <Pressable key={`${chapter.startSeconds}-${index}`} onPress={() => seek(chapter.startSeconds)} style={[styles.item, { borderBottomColor: palette.border, backgroundColor: activeIndex === index ? palette.raised : 'transparent' }]}>
        <View style={[styles.number, { backgroundColor: activeIndex === index ? '#0066CC' : palette.raised }]}><AppText style={{ color: activeIndex === index ? '#FFFFFF' : palette.muted, fontFamily: 'Inter-Bold', fontSize: 12 }}>{index + 1}</AppText></View>
        <View style={styles.meta}><AppText style={{ color: palette.text, fontFamily: 'Inter-Medium', fontSize: 14 }}>{chapter.title}</AppText><AppText style={{ color: palette.muted, fontSize: 11 }}>{formatTime(chapter.startSeconds)}</AppText></View>
        <Ionicons name="play-circle-outline" size={22} color={activeIndex === index ? '#0066CC' : palette.muted} />
      </Pressable>)}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({ state: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }, list: { paddingBottom: 20 }, item: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10 }, number: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, meta: { flex: 1, gap: 3 } });
