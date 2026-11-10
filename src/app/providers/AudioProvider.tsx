import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { playableUri, type QuranAudio } from '@/features/quran/models/QuranAudio';
import { FEATURED_QURAN_ARTWORK_URL } from '@/features/quran/services/featuredQuranFeed';
import {
  getPlaybackPositionMs,
  readQueue,
  readSetting,
  saveDuration,
  savePosition,
  setPlayed,
  writeQueue,
  writeSetting,
} from '@/storage/database';
import { useQuranLibrary } from '@/features/quran/state/QuranLibraryProvider';
import { findNextUnplayedFeaturedTrack } from './playbackPolicy';
import { setVolumeBoostEnabled } from '../../../modules/sheademtula-audio-effects';

const AUDIO_MODE = {
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix' as const,
};

export type SleepTimerMode = 'off' | 'time' | 'episode';
export type SleepTimerState = { mode: SleepTimerMode; deadlineMs: number | null; durationMinutes: number | null };

export type AudioContextValue = {
  currentTrack: QuranAudio | null;
  isPlaying: boolean;
  isLoading: boolean;
  playbackError: string | null;
  positionSeconds: number;
  durationSeconds: number;
  queue: QuranAudio[];
  playbackRate: number;
  sleepTimer: SleepTimerState;
  sleepRemainingSeconds: number;
  setSleepTimer: (mode: SleepTimerMode, minutes?: number) => void;
  playTrack: (track: QuranAudio, nextQueue?: QuranAudio[]) => Promise<void>;
  togglePlayback: () => void;
  seek: (seconds: number) => void;
  rewind: () => void;
  fastForward: () => void;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setRate: (rate: number) => void;
  addToQueue: (track: QuranAudio) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
  reorderQueue: (items: QuranAudio[]) => void;
};

const Context = createContext<AudioContextValue | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function AudioProvider({ children }: React.PropsWithChildren) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const nativeEffectPlayer = player as typeof player & { audioSessionId?: number; skipSilenceEnabled?: boolean };
  const status = useAudioPlayerStatus(player);
  const { tracks, settings, updateSettings, refresh, feedSettled, removeTrack, markFeedTrackSeen } = useQuranLibrary();
  const [currentTrack, setCurrentTrack] = useState<QuranAudio | null>(null);
  const [queue, setQueue] = useState<QuranAudio[]>([]);
  const [playbackRate, setPlaybackRate] = useState(settings.playbackSpeed);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerState>({ mode: 'off', deadlineMs: null, durationMinutes: null });
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState(0);

  const queueRef = useRef<QuranAudio[]>([]);
  const pendingTrackLoadRef = useRef<string | null>(null);
  const playAfterLoadRef = useRef(false);
  const sawUnloadedStateRef = useRef(false);
  const restoreAttemptedRef = useRef(false);
  const finishHandledRef = useRef<string | null>(null);
  const ignoreFinishUntilResetRef = useRef(false);
  const queueHydratedRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const sleepTimerRef = useRef<SleepTimerState>({ mode: 'off', deadlineMs: null, durationMinutes: null });
  const lastSavedPositionBucketRef = useRef(-1);
  const lastSavedDurationMsRef = useRef(0);
  const audioModePromiseRef = useRef<Promise<void> | null>(null);
  const effectSessionIdRef = useRef<number | null>(null);
  const volumeBoostAppliedRef = useRef<{ sessionId: number; enabled: boolean } | null>(null);
  const playbackSnapshotRef = useRef<{ trackId: string | null; positionMs: number }>({ trackId: null, positionMs: 0 });

  const ensureAudioMode = useCallback(async () => {
    if (!audioModePromiseRef.current) {
      audioModePromiseRef.current = setAudioModeAsync(AUDIO_MODE).catch((error: unknown) => {
        audioModePromiseRef.current = null;
        throw error;
      });
    }
    await audioModePromiseRef.current;
  }, []);

  const commitQueue = useCallback((items: QuranAudio[]) => {
    queueRef.current = items;
    setQueue(items);
    void writeQueue(items.map((item) => item.id)).catch((error: unknown) => {
      console.warn('Unable to persist the playback queue.', error);
    });
  }, []);

  const persistCurrentPosition = useCallback(async () => {
    const snapshot = playbackSnapshotRef.current;
    if (!snapshot.trackId) return;
    await savePosition(snapshot.trackId, snapshot.positionMs);
  }, []);

  const setSleepTimer = useCallback((mode: SleepTimerMode, minutes = 0) => {
    const next: SleepTimerState = mode === 'time'
      ? { mode, deadlineMs: Date.now() + Math.max(1, minutes) * 60_000, durationMinutes: Math.max(1, minutes) }
      : { mode, deadlineMs: null, durationMinutes: null };
    sleepTimerRef.current = next;
    setSleepTimerState(next);
    setSleepRemainingSeconds(mode === 'time' ? Math.max(1, minutes) * 60 : 0);
  }, []);

  const checkSleepDeadline = useCallback(() => {
    const activeTimer = sleepTimerRef.current;
    if (activeTimer.mode !== 'time' || activeTimer.deadlineMs === null) return;
    const remaining = Math.max(0, Math.ceil((activeTimer.deadlineMs - Date.now()) / 1000));
    setSleepRemainingSeconds(remaining);
    if (remaining > 0) return;

    player.pause();
    void persistCurrentPosition().catch((error: unknown) => {
      console.warn('Unable to save playback position when the sleep timer expires.', error);
    });
    setSleepTimer('off');
  }, [persistCurrentPosition, player, setSleepTimer]);

  useEffect(() => {
    if (sleepTimer.mode !== 'time') return;
    const interval = setInterval(checkSleepDeadline, 1000);
    checkSleepDeadline();
    return () => clearInterval(interval);
  }, [sleepTimer.mode, sleepTimer.deadlineMs, checkSleepDeadline]);

  useEffect(() => {
    void ensureAudioMode().catch((error: unknown) => {
      setPlaybackError(errorMessage(error, 'Unable to configure background audio playback.'));
    });
  }, [ensureAudioMode]);

  useEffect(() => {
    playbackSnapshotRef.current = {
      trackId: currentTrack?.id ?? null,
      positionMs: Math.max(0, Math.round((status.currentTime ?? 0) * 1000)),
    };
  }, [currentTrack?.id, status.currentTime]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'inactive' || nextState === 'background') {
        void persistCurrentPosition().catch((error: unknown) => {
          console.warn('Unable to save playback position while the app is backgrounding.', error);
        });
      } else if (nextState === 'active') {
        checkSleepDeadline();
      }
    });
    return () => subscription.remove();
  }, [checkSleepDeadline, persistCurrentPosition]);

  // OS interruptions can pause native playback without going through our UI
  // (phone calls, audio focus loss, headphone removal). Persist the last position
  // on that transition as well. Ignore the pause used internally while switching tracks.
  useEffect(() => {
    if (wasPlayingRef.current && !status.playing && currentTrack && status.isLoaded && !pendingTrackLoadRef.current) {
      void savePosition(currentTrack.id, Math.max(0, Math.round(status.currentTime * 1000))).catch((error: unknown) => {
        console.warn('Unable to save playback position after an audio interruption.', error);
      });
    }
    wasPlayingRef.current = status.playing;
  }, [currentTrack?.id, status.currentTime, status.isLoaded, status.playing]);

  // Preserve the most recent position if the app tree is torn down (for example,
  // during a native reload or root-level navigation reset).
  useEffect(() => () => {
    const snapshot = playbackSnapshotRef.current;
    if (snapshot.trackId) {
      void savePosition(snapshot.trackId, snapshot.positionMs).catch((error: unknown) => {
        console.warn('Unable to save playback position while releasing the player.', error);
      });
    }
    player.clearLockScreenControls();
  }, [player]);

  useEffect(() => {
    if (queueHydratedRef.current || !feedSettled || !tracks.length) return;
    queueHydratedRef.current = true;
    void readQueue()
      .then((ids) => {
        const restored = ids
          .map((id) => tracks.find((track) => track.id === id))
          .filter((track): track is QuranAudio => Boolean(track));
        commitQueue(restored);
      })
      .catch((error: unknown) => console.warn('Unable to restore the playback queue.', error));
  }, [tracks, feedSettled, commitQueue]);

  useEffect(() => {
    if (!queueHydratedRef.current) return;
    const validIds = new Set(tracks.map((track) => track.id));
    const nextQueue = queueRef.current.filter((track) => validIds.has(track.id));
    if (nextQueue.length !== queueRef.current.length) commitQueue(nextQueue);

    if (currentTrack && !validIds.has(currentTrack.id)) {
      player.pause();
      player.clearLockScreenControls();
      pendingTrackLoadRef.current = null;
      setCurrentTrack(null);
    }
  }, [tracks, currentTrack, player, commitQueue]);

  useEffect(() => {
    setPlaybackRate(settings.playbackSpeed);
  }, [settings.playbackSpeed]);

  useEffect(() => {
    player.playbackRate = playbackRate;
  }, [player, playbackRate]);

  // Media3 exposes native silence skipping on Android. Keep this switch on the
  // actual ExoPlayer instance so position/queue/lock-screen behavior stays intact.
  useEffect(() => {
    if (Platform.OS !== 'android' || typeof nativeEffectPlayer.audioSessionId !== 'number') return;
    try {
      nativeEffectPlayer.skipSilenceEnabled = settings.trimSilence;
    } catch (error) {
      console.warn('Unable to configure Android silence skipping.', error);
      if (settings.trimSilence) void updateSettings({ trimSilence: false });
    }
  }, [nativeEffectPlayer, currentTrack?.id, settings.trimSilence, updateSettings]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const reportedSessionId = nativeEffectPlayer.audioSessionId;
    const sessionId = typeof reportedSessionId === 'number' && reportedSessionId > 0
      ? reportedSessionId
      : effectSessionIdRef.current;
    if (!sessionId || !Number.isSafeInteger(sessionId)) return;

    const previousSessionId = effectSessionIdRef.current;
    if (previousSessionId && previousSessionId !== sessionId) {
      // Do not leave an enhancer attached to a session that the player no longer owns.
      void setVolumeBoostEnabled(previousSessionId, false).catch((error: unknown) => {
        console.warn('Unable to release the previous Android audio session effect.', error);
      });
      volumeBoostAppliedRef.current = null;
    }
    effectSessionIdRef.current = sessionId;
    if (settings.volumeBoost && (!status.isLoaded || !status.playing)) return;
    const lastApplied = volumeBoostAppliedRef.current;
    if (lastApplied?.sessionId === sessionId && lastApplied.enabled === settings.volumeBoost) return;

    let active = true;
    void setVolumeBoostEnabled(sessionId, settings.volumeBoost).then((available) => {
      if (!active) return;
      if (!settings.volumeBoost || available) {
        volumeBoostAppliedRef.current = { sessionId, enabled: settings.volumeBoost };
        return;
      }
      console.warn('Android volume boost is not available for the active audio session.');
      void updateSettings({ volumeBoost: false });
    }).catch((error: unknown) => {
      if (!active) return;
      console.warn('Unable to configure Android volume boost.', error);
      if (settings.volumeBoost) void updateSettings({ volumeBoost: false });
    });
    return () => { active = false; };
  }, [nativeEffectPlayer, status.isLoaded, status.playing, status.currentTime, currentTrack?.id, settings.volumeBoost, updateSettings]);

  useEffect(() => () => {
    const sessionId = effectSessionIdRef.current;
    if (Platform.OS === 'android' && sessionId && sessionId > 0) {
      void setVolumeBoostEnabled(sessionId, false).catch((error: unknown) => {
        console.warn('Unable to release Android volume boost.', error);
      });
    }
  }, []);

  // Restore the last selected item as paused after the cached/remote library is ready.
  useEffect(() => {
    if (restoreAttemptedRef.current || !feedSettled || !tracks.length) return;
    restoreAttemptedRef.current = true;
    void (async () => {
      await ensureAudioMode();
      const lastTrackId = await readSetting<string | null>('currentTrackId', null);
      if (!lastTrackId) return;
      const savedTrack = tracks.find((item) => item.id === lastTrackId);
      if (!savedTrack) return;
      const savedPosition = await getPlaybackPositionMs(savedTrack.id);
      const restoredTrack = { ...savedTrack, lastPositionMs: savedPosition };
      setCurrentTrack(restoredTrack);
      setPlaybackError(null);
      lastSavedPositionBucketRef.current = Math.floor(savedPosition / 5000);
      pendingTrackLoadRef.current = restoredTrack.id;
      playAfterLoadRef.current = false;
      ignoreFinishUntilResetRef.current = true;
      lastSavedDurationMsRef.current = restoredTrack.durationMs;
      sawUnloadedStateRef.current = !status.isLoaded;
      player.replace({ uri: playableUri(restoredTrack) });
    })().catch((error: unknown) => {
      setPlaybackError(errorMessage(error, 'Could not restore the last audio item.'));
    });
  }, [tracks, player, status.isLoaded, feedSettled, ensureAudioMode]);

  // A failed load must release the pending state, otherwise the mini-player can remain
  // stuck in its loading state indefinitely.
  useEffect(() => {
    if (!status.error) return;
    pendingTrackLoadRef.current = null;
    playAfterLoadRef.current = false;
    setPlaybackError(status.error);
  }, [status.error]);

  // Wait for a real unload/load transition before seeking; this avoids seeking the
  // previous media item when the user changes tracks quickly.
  useEffect(() => {
    const pendingId = pendingTrackLoadRef.current;
    if (!pendingId || !currentTrack || currentTrack.id !== pendingId) return;
    if (!status.isLoaded) {
      sawUnloadedStateRef.current = true;
      return;
    }
    if (!sawUnloadedStateRef.current) return;

    pendingTrackLoadRef.current = null;
    const shouldPlay = playAfterLoadRef.current;
    playAfterLoadRef.current = false;
    void (async () => {
      if (currentTrack.lastPositionMs > 0) {
        await player.seekTo(currentTrack.lastPositionMs / 1000);
      }
      player.setActiveForLockScreen(
        true,
        {
          title: currentTrack.title,
          artist: currentTrack.artist || 'Sheikh Aadam Tuulaa',
          albumTitle: 'Tafsiira Afaan Oromoo',
          artworkUrl: currentTrack.imageUrl || FEATURED_QURAN_ARTWORK_URL,
        },
        { showSeekBackward: true, showSeekForward: true },
      );
      if (shouldPlay) player.play();
    })().catch((error: unknown) => {
      setPlaybackError(errorMessage(error, 'Unable to start the selected audio.'));
    });
  }, [currentTrack, player, status.isLoaded]);

  useEffect(() => {
    if (!currentTrack || pendingTrackLoadRef.current || !status.isLoaded || !status.playing || status.currentTime < 0) return;
    const bucket = Math.floor(status.currentTime / 5);
    if (bucket !== lastSavedPositionBucketRef.current) {
      lastSavedPositionBucketRef.current = bucket;
      savePosition(currentTrack.id, status.currentTime * 1000).catch(() => undefined);
    }
  }, [currentTrack, status.currentTime, status.isLoaded, status.playing]);

  useEffect(() => {
    if (!currentTrack || pendingTrackLoadRef.current || !status.isLoaded || status.duration <= 0) return;
    const durationMs = Math.round(status.duration * 1000);
    if (durationMs !== lastSavedDurationMsRef.current) {
      lastSavedDurationMsRef.current = durationMs;
      saveDuration(currentTrack.id, durationMs).catch(() => undefined);
    }
  }, [currentTrack, status.duration, status.isLoaded]);

  const playTrack = useCallback(async (track: QuranAudio, nextQueue?: QuranAudio[]) => {
    try {
      setPlaybackError(null);
      await ensureAudioMode();

      if (currentTrack && currentTrack.id !== track.id && status.isLoaded) {
        await savePosition(currentTrack.id, Math.max(0, Math.round(status.currentTime * 1000)));
      }

      const savedPosition = await getPlaybackPositionMs(track.id);
      const selectedTrack = { ...track, lastPositionMs: savedPosition };
      const queueBase = nextQueue ?? queueRef.current;
      let remainingQueue = queueBase.filter((item) => item.id !== track.id);

      // Match the Flutter player: when a user starts a different item while a queue
      // is active, retain the current item at the top so it is not silently lost.
      if (!nextQueue && currentTrack && currentTrack.id !== track.id && queueBase.length > 0) {
        remainingQueue = [currentTrack, ...remainingQueue.filter((item) => item.id !== currentTrack.id)];
      }

      commitQueue(remainingQueue);
      pendingTrackLoadRef.current = track.id;
      playAfterLoadRef.current = true;
      sawUnloadedStateRef.current = !status.isLoaded;
      finishHandledRef.current = null;
      ignoreFinishUntilResetRef.current = true;
      lastSavedDurationMsRef.current = selectedTrack.durationMs;
      lastSavedPositionBucketRef.current = Math.floor(savedPosition / 5000);

      player.pause();
      setCurrentTrack(selectedTrack);
      markFeedTrackSeen(track.id);
      await writeSetting('currentTrackId', track.id);
      player.replace({ uri: playableUri(track) });
    } catch (error) {
      pendingTrackLoadRef.current = null;
      playAfterLoadRef.current = false;
      const message = errorMessage(error, 'The selected Quran audio could not be started.');
      setPlaybackError(message);
    }
  }, [commitQueue, currentTrack, ensureAudioMode, markFeedTrackSeen, player, status.currentTime, status.isLoaded]);

  const next = useCallback(async () => {
    const nextTrack = queueRef.current[0];
    if (!nextTrack) return;
    const remaining = queueRef.current.slice(1);
    commitQueue(remaining);
    await playTrack(nextTrack, remaining);
  }, [commitQueue, playTrack]);

  useEffect(() => {
    if (status.didJustFinish && currentTrack && !pendingTrackLoadRef.current && !ignoreFinishUntilResetRef.current && finishHandledRef.current !== currentTrack.id) {
      finishHandledRef.current = currentTrack.id;
      const sleepingWithQueuedItems = sleepTimerRef.current.mode === 'episode' && queueRef.current.length > 0;
      void Promise.all([
        setPlayed(currentTrack.id, true),
        savePosition(currentTrack.id, 0),
      ]).then(async () => {
        if (settings.deleteDownloadedPlayedEpisodes && currentTrack.sourceType === 'featured-google-drive' && currentTrack.localUri && !sleepingWithQueuedItems) {
          await removeTrack(currentTrack);
        } else {
          await refresh();
        }
      }).catch((error: unknown) => {
        console.warn('Unable to finish saving the completed Quran audio item.', error);
      });
      if (sleepTimerRef.current.mode === 'episode') {
        player.pause();
        setSleepTimer('off');
      } else if (queueRef.current.length > 0) {
        // The original Flutter player always advances an explicit queue,
        // independently of the continuous-play preference.
        void next().catch((error: unknown) => {
          setPlaybackError(errorMessage(error, 'The next queued Quran audio item could not be started.'));
        });
      } else if (settings.autoPlayNext) {
        const nextFeatured = findNextUnplayedFeaturedTrack(currentTrack, tracks);
        if (nextFeatured) {
          void playTrack(nextFeatured, []).catch((error: unknown) => {
            setPlaybackError(errorMessage(error, 'The next Quran audio item could not be started.'));
          });
        } else {
          player.pause();
        }
      } else {
        player.pause();
      }
    } else if (!status.didJustFinish) {
      finishHandledRef.current = null;
      ignoreFinishUntilResetRef.current = false;
    }
  }, [status.didJustFinish, currentTrack, tracks, settings.autoPlayNext, settings.deleteDownloadedPlayedEpisodes, next, playTrack, player, refresh, removeTrack, setSleepTimer]);

  const previous = useCallback(async () => {
    if (status.currentTime > 3) {
      await player.seekTo(0);
      return;
    }
    const previousTrack = tracks.find((item) => item.id !== currentTrack?.id && !item.isPlayed);
    if (previousTrack) await playTrack(previousTrack, queueRef.current);
  }, [currentTrack?.id, playTrack, player, status.currentTime, tracks]);

  const addToQueue = useCallback((track: QuranAudio) => {
    if (queueRef.current.some((item) => item.id === track.id) || currentTrack?.id === track.id) return;
    commitQueue([...queueRef.current, track]);
  }, [commitQueue, currentTrack?.id]);

  const removeFromQueue = useCallback((trackId: string) => {
    commitQueue(queueRef.current.filter((item) => item.id !== trackId));
  }, [commitQueue]);

  const clearQueue = useCallback(() => commitQueue([]), [commitQueue]);

  const reorderQueue = useCallback((items: QuranAudio[]) => {
    const unique = items.filter((item, index) => items.findIndex((candidate) => candidate.id === item.id) === index && item.id !== currentTrack?.id);
    commitQueue(unique);
  }, [commitQueue, currentTrack?.id]);

  const setRate = useCallback((rate: number) => {
    const safeRate = Math.min(2, Math.max(0.5, Math.round(rate * 10) / 10));
    setPlaybackRate(safeRate);
    void updateSettings({ playbackSpeed: safeRate });
  }, [updateSettings]);

  const togglePlayback = useCallback(() => {
    if (!currentTrack) return;
    setPlaybackError(null);
    if (status.playing) {
      void savePosition(currentTrack.id, Math.max(0, Math.round(status.currentTime * 1000))).catch(() => undefined);
      player.pause();
    } else {
      if (status.duration > 0 && status.currentTime >= status.duration - 0.5) {
        void player.seekTo(0);
      }
      player.play();
    }
  }, [currentTrack, player, status.currentTime, status.duration, status.playing]);

  const seek = useCallback((seconds: number) => {
    const target = Math.max(0, Math.min(seconds, status.duration > 0 ? status.duration : seconds));
    void player.seekTo(target);
  }, [player, status.duration]);

  const rewind = useCallback(() => {
    void player.seekTo(Math.max(0, status.currentTime - 10));
  }, [player, status.currentTime]);

  const fastForward = useCallback(() => {
    const duration = status.duration > 0 ? status.duration : status.currentTime + 30;
    void player.seekTo(Math.min(duration, status.currentTime + 30));
  }, [player, status.currentTime, status.duration]);

  const value = useMemo<AudioContextValue>(() => ({
    currentTrack,
    isPlaying: status.playing,
    isLoading: Boolean(currentTrack) && !playbackError && (pendingTrackLoadRef.current !== null || status.isBuffering || !status.isLoaded),
    playbackError,
    positionSeconds: status.currentTime ?? 0,
    durationSeconds: status.duration ?? 0,
    queue,
    playbackRate,
    sleepTimer,
    sleepRemainingSeconds,
    setSleepTimer,
    playTrack,
    togglePlayback,
    seek,
    rewind,
    fastForward,
    next,
    previous,
    setRate,
    addToQueue,
    removeFromQueue,
    clearQueue,
    reorderQueue,
  }), [
    currentTrack, status, queue, playbackRate, playbackError, sleepTimer, sleepRemainingSeconds, setSleepTimer, playTrack, togglePlayback,
    seek, rewind, fastForward, next, previous, setRate, addToQueue, removeFromQueue,
    clearQueue, reorderQueue,
  ]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAudio() {
  const context = useContext(Context);
  if (!context) throw new Error('useAudio must be used inside AudioProvider');
  return context;
}
