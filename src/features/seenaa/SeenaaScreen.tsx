import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Screen } from '@/shared/components/Screen';
import { TopBar } from '@/shared/components/TopBar';
import { Surface } from '@/tds/components/Surface';
import { AppText, textStyles } from '@/tds/components/Text';
import { usePalette } from '@/tds/theme';
import { useLocalization } from '@/localization/LocalizationProvider';
import biography from './biography.json';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import { QuranArtwork } from '@/features/quran/components/QuranArtwork';

type BiographyBlock = { text: string; heading: boolean };
const videos = [
  { label: 'Part 1', id: 'lZFKIvMSgVI' },
  { label: 'Part 2', id: '6zMLEeJTtvk' },
];

export default function SeenaaScreen() {
  const palette = usePalette();
  const { t } = useLocalization();
  const { tracks } = useQuranLibrary();
  const featuredArtwork = tracks.find((track) => track.sourceType === 'featured-google-drive')?.imageUrl;
  return <Screen>
    <TopBar title="Sheikh Aadam Tuulaa" />
    <Surface style={styles.profile}>
      <QuranArtwork uri={featuredArtwork} style={styles.art} />
      <View style={{ flex: 1, gap: 5, justifyContent: 'center' }}>
        <AppText style={styles.name}>Sheikh Aadam Tuulaa</AppText>
        <AppText style={{ color: palette.muted, fontSize: 12 }}>{t('biography_subtitle')}</AppText>
        <AppText style={{ color: palette.muted, fontSize: 11 }}>Dr. Jeylani Kadir Gamada</AppText>
      </View>
    </Surface>
    <AppText style={textStyles.subheading}>{t('video_label')}</AppText>
    {videos.map(video => <View key={video.id} style={styles.videoWrap}>
      <AppText style={[textStyles.label, { color: palette.muted }]}>{video.label}</AppText>
      <Surface style={styles.videoSurface}>
        <WebView
          source={{ uri: `https://www.youtube-nocookie.com/embed/${video.id}?start=30&playsinline=1&rel=0` }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          originWhitelist={['https://*']}
        />
      </Surface>
    </View>)}
    <View style={{ gap: 6 }}>
      {(biography as BiographyBlock[]).map((block, index) => <AppText key={index} style={block.heading ? [styles.heading, { color: palette.text }] : [styles.paragraph, { color: palette.text }]}>{block.text}</AppText>)}
    </View>
  </Screen>;
}
const styles = StyleSheet.create({ profile: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 }, art: { width: 84, height: 84, borderRadius: 18 }, name: { fontFamily: 'Inter-Bold', fontSize: 17, lineHeight: 23 }, videoWrap: { gap: 7 }, videoSurface: { height: 202, padding: 0, borderRadius: 16, overflow: 'hidden' }, webView: { flex: 1, backgroundColor: '#080A0D' }, heading: { fontFamily: 'Inter-Bold', fontSize: 19, marginTop: 18, marginBottom: 4 }, paragraph: { fontFamily: 'Inter', fontSize: 14, lineHeight: 22, marginVertical: 5 } });
