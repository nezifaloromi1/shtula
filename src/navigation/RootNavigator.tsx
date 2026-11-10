import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import PlayerScreen from '@/features/player/PlayerScreen';
import QueueScreen from '@/features/queue/QueueScreen';
import SearchScreen from '@/features/search/SearchScreen';
import SettingsScreen from '@/features/settings/SettingsScreen';
import ChaptersScreen from '@/features/chapters/ChaptersScreen';
import TranscriptScreen from '@/features/transcripts/TranscriptScreen';
import ShowNotesScreen from '@/features/show-notes/ShowNotesScreen';
import { usePalette } from '@/tds/theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
export default function RootNavigator() {
  const palette = usePalette();
  const theme = { ...(palette.background === '#000000' ? DarkTheme : DefaultTheme), colors: { ...(palette.background === '#000000' ? DarkTheme.colors : DefaultTheme.colors), background: palette.background, card: palette.background, text: palette.text, border: palette.border, primary: '#0066CC', notification: '#0066CC' } };
  return <NavigationContainer theme={theme}>
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: palette.background } }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Player" component={PlayerScreen} />
      <Stack.Screen name="Queue" component={QueueScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Chapters" component={ChaptersScreen} />
      <Stack.Screen name="Transcript" component={TranscriptScreen} />
      <Stack.Screen name="ShowNotes" component={ShowNotesScreen} />
    </Stack.Navigator>
  </NavigationContainer>;
}
