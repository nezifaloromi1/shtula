import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAudio } from '@/app/providers/AudioProvider';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import type { QuranAudio } from '@/features/quran/models/QuranAudio';

export function usePlayQuranTrack() {
  const navigation = useNavigation<any>();
  const audio = useAudio();
  const { settings } = useQuranLibrary();

  return useCallback(async (track: QuranAudio, nextQueue?: QuranAudio[]) => {
    await audio.playTrack(track, nextQueue);
    if (settings.autoOpenNowPlaying) {
      const state = navigation.getState();
      const currentRoute = state.routes[state.index]?.name;
      if (currentRoute !== 'Player') navigation.navigate('Player');
    }
  }, [audio.playTrack, navigation, settings.autoOpenNowPlaying]);
}
