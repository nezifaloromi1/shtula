import React from 'react';
import { useColorScheme } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useLocales } from 'expo-localization';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/tds/theme';
import { QuranLibraryProvider, useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import { AudioProvider } from './providers/AudioProvider';
import RootNavigator from '@/navigation/RootNavigator';
import { StartupErrorScreen } from './StartupErrorScreen';
import { LocalizationProvider } from '@/localization/LocalizationProvider';

void SplashScreen.preventAutoHideAsync();

function AppShell({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { settings, ready, startupError, isRetryingStartup, retryStartup } = useQuranLibrary();
  const locales = useLocales();
  const systemDark = useColorScheme() === 'dark';

  React.useEffect(() => {
    if (fontsLoaded && ready) void SplashScreen.hideAsync();
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) return null;

  return <LocalizationProvider locales={locales}>
    <ThemeProvider mode={settings.themeMode} systemDark={systemDark}>
      {startupError ? (
        <>
          <StartupErrorScreen message={startupError} retrying={isRetryingStartup} onRetry={retryStartup} />
          <StatusBar style={settings.themeMode === 'light' || (settings.themeMode === 'system' && !systemDark) ? 'dark' : 'light'} />
        </>
      ) : (
        <AudioProvider>
          <RootNavigator />
          <StatusBar style={settings.themeMode === 'light' || (settings.themeMode === 'system' && !systemDark) ? 'dark' : 'light'} />
        </AudioProvider>
      )}
    </ThemeProvider>
  </LocalizationProvider>;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter: require('../../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
    'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
  });

  return <SafeAreaProvider>
    <QuranLibraryProvider>
      <AppShell fontsLoaded={fontsLoaded} />
    </QuranLibraryProvider>
  </SafeAreaProvider>;
}
