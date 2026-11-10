import React from 'react';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { Surface } from '@/tds/components/Surface';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import { useAudio } from '@/app/providers/AudioProvider';
import { usePlayQuranTrack } from '@/app/hooks/usePlayQuranTrack';
import { QuranArtwork } from '@/features/quran/components/QuranArtwork';
import { useLocalization } from '@/localization/LocalizationProvider';

export default function HomeScreen() {
  const palette = usePalette();
  const { t, isRTL } = useLocalization();
  const navigation = useNavigation<any>();
  const { tracks, settings, newFeaturedTrackIds } = useQuranLibrary();
  const audio = useAudio();
  const playTrack = usePlayQuranTrack();
  const featuredTracks = tracks.filter((track) => track.sourceType === 'featured-google-drive');
  const recommended = [...featuredTracks].sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
  const playFeatured = async () => {
    if (!featuredTracks.length) return;
    await playTrack(recommended[0]);
  };

  return <Screen>
    <TopBar title="Sheikh Aadam Tuulaa" />

    <Surface style={styles.hero}>
      <View style={[styles.heroTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <QuranArtwork uri={featuredTracks[0]?.imageUrl} style={styles.heroImage} />
        <View style={styles.heroContent}>
          <AppText style={styles.heroTitle}>Sheikh Aadam Tuulaa</AppText>
          <AppText style={styles.heroSubtitle}>{t('home_featured_subtitle')}</AppText>
        </View>
      </View>
      {featuredTracks.length > 0 ? <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.chip}><Ionicons name="library-music-outline" size={15} color="#FFFFFF"/><AppText style={styles.chipText}>{settings.layoutCount ? t('unplayed_episode_count_label', { count: featuredTracks.filter((track) => !track.isPlayed).length }) : t('episodes_available_count_label', { count: featuredTracks.length })}</AppText></View>
        <View style={styles.chip}><Ionicons name="headset-outline" size={15} color="#FFFFFF"/><AppText style={styles.chipText}>{t('tafsiira_label')}</AppText></View>
        {settings.layoutHighlight && newFeaturedTrackIds.length ? <View style={styles.chip}><Ionicons name="sparkles" size={14} color="#FFFFFF"/><AppText style={styles.chipText}>{t('new_episode_count_label', { count: newFeaturedTrackIds.length })}</AppText></View> : null}
      </View> : null}
      <Pressable onPress={() => void playFeatured()} disabled={!featuredTracks.length} style={({ pressed }) => [styles.playFeatured, !featuredTracks.length && styles.playFeaturedDisabled, pressed && featuredTracks.length > 0 && styles.pressed]}>
        <Ionicons name="play" size={22} color="#0066CC" />
        <AppText style={styles.playFeaturedText}>{t('play_button_label')}</AppText>
      </Pressable>
    </Surface>

    {audio.currentTrack ? <View style={styles.section}>
      <AppText style={textStyles.subheading}>{t('home_continue_listening_label')}</AppText>
      <Pressable onPress={() => navigation.navigate('Player')} style={styles.continueRow}>
        <View style={[styles.continueIcon, { backgroundColor: 'rgba(0,102,204,0.10)' }]}><Ionicons name="audiotrack" size={23} color="#0066CC" /></View>
        <View style={styles.continueMeta}>
          <AppText numberOfLines={1} style={styles.continueTitle}>{audio.currentTrack.title}</AppText>
          <AppText style={{ color: palette.muted, fontSize: 12 }}>{audio.isPlaying ? t('now_playing_queue_label') : t('resume_button_label')}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t(audio.isPlaying ? 'pause_button_label' : 'play_button_label')} onPress={audio.togglePlayback} style={styles.continueControl}>
          <Ionicons name={audio.isPlaying ? 'pause' : 'play'} size={22} color="#0066CC" />
        </Pressable>
      </Pressable>
    </View> : null}

    {recommended.length ? <View style={styles.section}>
      <AppText style={textStyles.subheading}>{t('home_recommended_label')}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendedList}>
        {recommended.map(track => <Pressable key={track.id} onPress={() => void playTrack(track)} style={styles.recommendedCard}>
          <View style={styles.recommendedArtworkWrap}>
            <QuranArtwork uri={track.imageUrl} style={styles.recommendedArtwork} />
            <View style={styles.recommendedPlay}><Ionicons name="play" size={20} color="#FFFFFF" /></View>
            {settings.layoutHighlight && newFeaturedTrackIds.includes(track.id) ? <View style={styles.recommendedNewBadge}><AppText style={styles.recommendedNewText}>{t('new_badge_label')}</AppText></View> : null}
          </View>
          <AppText numberOfLines={2} style={styles.recommendedTitle}>{track.title}</AppText>
        </Pressable>)}
      </ScrollView>
    </View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { marginTop: 2, padding: 22, borderRadius: 28, backgroundColor: '#0066CC', borderColor: '#0066CC', gap: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroImage: { width: 92, height: 92, borderRadius: 20 },
  heroContent: { flex: 1, gap: 7 },
  heroTitle: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },
  heroSubtitle: { color: 'rgba(255,255,255,0.82)', fontFamily: 'Inter', fontSize: 15, lineHeight: 20 },
  chips: { flexDirection: 'row', gap: 10 },
  chip: { borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: '#FFFFFF', fontFamily: 'Inter-Medium', fontSize: 11 },
  playFeatured: { minHeight: 52, borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  playFeaturedDisabled: { opacity: 0.52 },
  playFeaturedText: { color: '#0066CC', fontFamily: 'Inter-Bold', fontSize: 16 },
  pressed: { opacity: 0.8 },
  section: { gap: 12 },
  continueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 4 },
  continueIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  continueMeta: { flex: 1, gap: 4 },
  continueTitle: { fontFamily: 'Inter-Medium', fontSize: 14 },
  continueControl: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,102,204,0.10)' },
  recommendedList: { gap: 14, paddingRight: 6 },
  recommendedCard: { width: 150, gap: 8 },
  recommendedArtworkWrap: { width: 150, height: 150, borderRadius: 16, overflow: 'hidden' },
  recommendedArtwork: { width: '100%', height: '100%' },
  recommendedPlay: { position: 'absolute', right: 8, bottom: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  recommendedNewBadge: { position: 'absolute', left: 8, top: 8, borderRadius: 6, backgroundColor: '#0066CC', paddingHorizontal: 7, paddingVertical: 4 },
  recommendedNewText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 9 },
  recommendedTitle: { fontFamily: 'Inter-Medium', fontSize: 13, lineHeight: 17 },
});
