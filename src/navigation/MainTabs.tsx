import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAudio } from '@/app/providers/AudioProvider';
import { usePalette } from '@/tds/theme';
import { useLocalization } from '@/localization/LocalizationProvider';
import { AppText } from '@/tds/components/Text';
import HomeScreen from '@/features/home/HomeScreen';
import TafsiiraScreen from '@/features/tafsiira/TafsiiraScreen';
import SeenaaScreen from '@/features/seenaa/SeenaaScreen';
import DownloadsScreen from '@/features/downloads/DownloadsScreen';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function MiniPlayer() {
  const audio = useAudio();
  const navigation = useNavigation<any>();
  const palette = usePalette();
  const { t, isRTL } = useLocalization();
  if (!audio.currentTrack) return null;
  return <Pressable onPress={() => navigation.navigate('Player')} style={[styles.mini, { backgroundColor: palette.surface, borderColor: palette.border, direction: isRTL ? 'rtl' : 'ltr' }]}>
    <View style={styles.miniArt}><Ionicons name="headset" color="#FFFFFF" size={19} /></View>
    <View style={{ flex: 1, gap: 2 }}><AppText numberOfLines={1} style={styles.miniTitle}>{audio.currentTrack.title}</AppText><AppText numberOfLines={1} style={{ color: palette.muted, fontSize: 10 }}>{audio.currentTrack.artist}</AppText></View>
    <Pressable accessibilityLabel={t(audio.isPlaying ? 'pause_button_label' : 'play_button_label')} onPress={audio.togglePlayback} style={styles.miniControl}><Ionicons name={audio.isPlaying ? 'pause' : 'play'} size={20} color={palette.text} /></Pressable>
    <Pressable accessibilityLabel="Open queue" onPress={() => navigation.navigate('Queue')} style={styles.miniControl}><Ionicons name="list" size={20} color={palette.text} /></Pressable>
  </Pressable>;
}

function AppTabBar(props: any) {
  return <View style={styles.tabShell}><MiniPlayer /><BottomTabBar {...props} /></View>;
}

export default function MainTabs() {
  const palette = usePalette();
  const { t, isRTL } = useLocalization();
  return <Tab.Navigator
    initialRouteName="Home"
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#FFFFFF',
      tabBarInactiveTintColor: '#8A929E',
      tabBarStyle: { backgroundColor: '#050608', borderTopColor: '#20252D', height: 61, paddingTop: 5, paddingBottom: 5, direction: isRTL ? 'rtl' : 'ltr' },
      tabBarLabelStyle: { fontFamily: 'Inter-Medium', fontSize: 10 },
    }}
    tabBar={(props) => <View style={{ direction: isRTL ? 'rtl' : 'ltr' }}><AppTabBar {...props} /></View>}
  >
    <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('home'), tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
    <Tab.Screen name="Tafsiira" component={TafsiiraScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="book" color={color} size={size} /> }} />
    <Tab.Screen name="Seenaa" component={SeenaaScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
    <Tab.Screen name="Downloads" component={DownloadsScreen} options={{ tabBarLabel: t('downloads'), tabBarIcon: ({ color, size }) => <Ionicons name="download" color={color} size={size} /> }} />
  </Tab.Navigator>;
}
const styles = StyleSheet.create({ tabShell: { backgroundColor: '#050608' }, mini: { marginHorizontal: 9, marginTop: 7, marginBottom: 5, minHeight: 58, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, miniArt: { width: 38, height: 38, backgroundColor: '#0066CC', borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, miniTitle: { fontFamily: 'Inter-Medium', fontSize: 12 }, miniControl: { padding: 8 } });
