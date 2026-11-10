import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import LocalLibrary from '../../../../modules/sheademtula-local-library';
import { AudioDownloadCancelledError, cancelQuranAudioDownload, cleanupCompletedAndroidQuranDownload, cleanupCompletedIOSQuranDownload, downloadQuranAudio, recoverOrphanedAndroidQuranDownloads, recoverOrphanedIOSQuranDownloads, setQuranAudioAppActive, type AudioDownloadProgress } from '../services/audioDownloadManager';
import type { QuranAudio } from '../models/QuranAudio';
import {
  clearAudioDownload,
  clearDownloadedUri,
  initializeDatabase,
  insertQuranAudio,
  listDownloadedQuranAudio,
  listPendingAudioDownloads,
  listQuranAudio,
  readSetting,
  removeQuranAudio,
  setDownloadedUri,
  setPlayed,
  setAllFeaturedQuranTracksPlayed,
  upsertFeaturedQuranAudio,
  writeSetting,
} from '@/storage/database';
import { loadFeaturedQuranFeed } from '../services/featuredQuranFeed';
import { importLegacySembastExport } from '@/storage/legacyMigration';
import { normalizeRefreshPeriod, shouldRefreshQuranFeed } from '../services/refreshPolicy';
import { findNewFeedIds, normalizeLayoutMode, normalizeLayoutOrder, type QuranLayoutMode, type QuranLayoutOrder } from '../services/layoutPolicy';
import { mapLegacyDisplayPreferences, readLegacyBoolean, readLegacyNumber } from '../services/legacyDisplayPreferences';
import { mapLegacyAudioPreferences } from '../services/legacyAudioPreferences';
import { mapLegacyBackgroundPreferences } from '../services/legacyBackgroundPreferences';
import {
  beginQuranRefreshStatusNotification,
  finishQuranRefreshStatusNotification,
  synchronizeBackgroundQuranRefresh,
} from '../services/backgroundQuranRefresh';
import { resolveLocalePreference, translate } from '@/localization';

export type LibrarySettings = {
  themeMode: 'system' | 'light' | 'dark';
  language: string;
  playbackSpeed: number;
  autoPlayNext: boolean;
  markDeletedEpisodesAsPlayed: boolean;
  deleteDownloadedPlayedEpisodes: boolean;
  autoUpdatePeriodMinutes: number;
  autoOpenNowPlaying: boolean;
  trimSilence: boolean;
  volumeBoost: boolean;
  layoutMode: QuranLayoutMode;
  layoutOrder: QuranLayoutOrder;
  layoutHighlight: boolean;
  layoutCount: boolean;
  backgroundRefreshEnabled: boolean;
  backgroundRefreshOnMobileData: boolean;
  backgroundRefreshNotifications: boolean;
};
type QuranLibraryContextValue = {
  ready: boolean;
  startupError: string | null;
  isRetryingStartup: boolean;
  retryStartup: () => void;
  feedSettled: boolean;
  feedLoading: boolean;
  feedError: string | null;
  tracks: QuranAudio[];
  downloadedTracks: QuranAudio[];
  downloadProgress: Record<string, AudioDownloadProgress>;
  newFeaturedTrackIds: string[];
  settings: LibrarySettings;
  importAudio: () => Promise<void>;
  importLegacyBackup: () => Promise<void>;
  downloadTrack: (track: QuranAudio) => Promise<void>;
  cancelDownload: (trackId: string) => void;
  removeTrack: (track: QuranAudio) => Promise<void>;
  refresh: () => Promise<void>;
  refreshFeed: () => Promise<void>;
  updateSettings: (patch: Partial<LibrarySettings>) => Promise<void>;
  markFeedTrackSeen: (trackId: string) => void;
  setTrackPlayed: (trackId: string, played: boolean) => Promise<void>;
  setAllFeedTracksPlayed: (played: boolean) => Promise<void>;
};

const defaultSettings: LibrarySettings = {
  themeMode: 'system',
  language: 'system',
  playbackSpeed: 1,
  autoPlayNext: false,
  markDeletedEpisodesAsPlayed: false,
  deleteDownloadedPlayedEpisodes: false,
  autoUpdatePeriodMinutes: 180,
  autoOpenNowPlaying: false,
  trimSilence: false,
  volumeBoost: false,
  layoutMode: 0,
  layoutOrder: 'alphabetical',
  layoutHighlight: false,
  layoutCount: false,
  backgroundRefreshEnabled: false,
  backgroundRefreshOnMobileData: false,
  backgroundRefreshNotifications: false,
};
const Context = createContext<QuranLibraryContextValue | null>(null);

function localizeForLanguage(
  languagePreference: string,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const locale = resolveLocalePreference(languagePreference, getLocales());
  return translate(locale, key, values);
}

function displayName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || fileName;
}

function createId(fileUri: string, sizeBytes: number): string {
  // Stable IDs derive from the copied private path, so two different files with
  // the same display name and size do not collapse into one library entry.
  const seed = `${fileUri}:${sizeBytes}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `audio-${(hash >>> 0).toString(16)}`;
}

export function QuranLibraryProvider({ children }: React.PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [isRetryingStartup, setIsRetryingStartup] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [feedSettled, setFeedSettled] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<QuranAudio[]>([]);
  const [downloadedTracks, setDownloadedTracks] = useState<QuranAudio[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, AudioDownloadProgress>>({});
  const [newFeaturedTrackIds, setNewFeaturedTrackIds] = useState<string[]>([]);
  const newFeaturedTrackIdsRef = useRef<string[]>([]);
  const activeDownloadIdsRef = useRef(new Set<string>());
  const downloadRecoveryInFlightRef = useRef(false);
  const feedRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const [settings, setSettings] = useState(defaultSettings);

  const refresh = useCallback(async () => {
    const [allTracks, offlineTracks, storedNewTrackIds] = await Promise.all([
      listQuranAudio(),
      listDownloadedQuranAudio(),
      readSetting<string[]>('newFeaturedTrackIds', []),
    ]);
    const validNewTrackIds = Array.isArray(storedNewTrackIds)
      ? storedNewTrackIds.filter((id): id is string => typeof id === 'string')
      : [];
    newFeaturedTrackIdsRef.current = validNewTrackIds;
    setNewFeaturedTrackIds(validNewTrackIds);
    setTracks(allTracks);
    setDownloadedTracks(offlineTracks);
  }, []);

  const refreshFeed = useCallback(async () => {
    if (feedRefreshInFlightRef.current) return feedRefreshInFlightRef.current;
    setFeedLoading(true);
    setFeedError(null);
    const refreshPromise = (async () => {
      let refreshNotificationId: string | null = null;
      try {
        if (settings.backgroundRefreshNotifications) {
          try {
            refreshNotificationId = await beginQuranRefreshStatusNotification(settings.language);
          } catch {
            // Local notification permission is independent of feed refresh availability.
          }
        }
        const cachedBeforeRefresh = await listQuranAudio();
        const cachedFeaturedIds = new Set(cachedBeforeRefresh
          .filter((track) => track.sourceType === 'featured-google-drive')
          .map((track) => track.id));
        const remoteTracks = await loadFeaturedQuranFeed();
        const newlyDiscoveredIds = findNewFeedIds(cachedFeaturedIds, remoteTracks);
        if (newlyDiscoveredIds.length) {
          const previouslyNew = await readSetting<string[]>('newFeaturedTrackIds', []);
          const nextNewIds = [...new Set([...previouslyNew, ...newlyDiscoveredIds])];
          newFeaturedTrackIdsRef.current = nextNewIds;
          setNewFeaturedTrackIds(nextNewIds);
          await writeSetting('newFeaturedTrackIds', nextNewIds);
        }
        for (const track of remoteTracks) await upsertFeaturedQuranAudio(track);
        await writeSetting('lastQuranFeedRefreshAt', Date.now());
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load the configured Quran audio feed.';
        setFeedError(message);
        // A previously cached feed remains available when Google Drive is offline.
        await refresh().catch(() => undefined);
      } finally {
        if (refreshNotificationId) {
          await finishQuranRefreshStatusNotification(refreshNotificationId).catch((error: unknown) => {
            console.warn('The Quran library refresh notification could not be dismissed.', error);
          });
        }
        setFeedLoading(false);
        setFeedSettled(true);
        feedRefreshInFlightRef.current = null;
      }
    })();
    feedRefreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [refresh, settings.backgroundRefreshNotifications, settings.language]);

  const maybeRefreshFeed = useCallback(async (requestedPeriod = settings.autoUpdatePeriodMinutes) => {
    const cached = await listQuranAudio();
    const hasCachedFeaturedItems = cached.some((track) => track.sourceType === 'featured-google-drive');
    if (!hasCachedFeaturedItems) {
      await refreshFeed();
      return;
    }

    const lastRefreshAt = await readSetting<number>('lastQuranFeedRefreshAt', 0);
    if (shouldRefreshQuranFeed({
      hasCachedFeaturedItems,
      lastRefreshAt,
      periodMinutes: requestedPeriod,
    })) {
      await refreshFeed();
    } else {
      setFeedSettled(true);
    }
  }, [refreshFeed, settings.autoUpdatePeriodMinutes]);

  // Startup uses the latest settings-aware refresh callback without making the
  // initialization effect restart whenever preferences are loaded from SQLite.
  const maybeRefreshFeedRef = useRef(maybeRefreshFeed);
  maybeRefreshFeedRef.current = maybeRefreshFeed;

  const retryStartup = useCallback(() => {
    if (isRetryingStartup) return;
    setIsRetryingStartup(true);
    setStartupAttempt((attempt) => attempt + 1);
  }, [isRetryingStartup]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await initializeDatabase();

      // Import the previous Flutter app's private audio files once, without deleting originals.
      const migrationComplete = await readSetting<boolean>('legacyDownloadsImported', false);
      if (!migrationComplete) {
        try {
          const legacy = await LocalLibrary.importLegacyDownloads();
          for (const asset of legacy.files) {
            await insertQuranAudio({
              id: createId(asset.uri, asset.sizeBytes),
              title: displayName(asset.fileName),
              artist: 'Sheikh Aadam Tuulaa',
              uri: asset.uri,
              fileName: asset.fileName,
              mimeType: null,
              sizeBytes: asset.sizeBytes,
            });
          }
          // An absent folder can mean removable storage is temporarily unavailable.
          // Keep the marker unset in that case so the next launch retries the scan.
          if (legacy.foundLegacyDirectory) await writeSetting('legacyDownloadsImported', true);
        } catch (migrationError) {
          console.warn('Legacy audio migration could not complete; it will be retried on the next launch.', migrationError);
        }
      }

      const storedSettings = await readSetting<LibrarySettings>('preferences', defaultSettings);
      const savedNewTrackIds = await readSetting<string[]>('newFeaturedTrackIds', []);
      const validSavedNewTrackIds = Array.isArray(savedNewTrackIds) ? savedNewTrackIds : [];
      newFeaturedTrackIdsRef.current = validSavedNewTrackIds;
      setNewFeaturedTrackIds(validSavedNewTrackIds);
      const preferencesMigrationVersion = await readSetting<number>('legacyPreferencesMigrationVersion', 0);
      let nextSettings: LibrarySettings = {
        ...defaultSettings,
        ...storedSettings,
        layoutMode: normalizeLayoutMode(Number(storedSettings.layoutMode ?? defaultSettings.layoutMode)),
        layoutOrder: normalizeLayoutOrder(String(storedSettings.layoutOrder ?? defaultSettings.layoutOrder)),
        layoutHighlight: typeof storedSettings.layoutHighlight === 'boolean' ? storedSettings.layoutHighlight : defaultSettings.layoutHighlight,
        layoutCount: typeof storedSettings.layoutCount === 'boolean' ? storedSettings.layoutCount : defaultSettings.layoutCount,
        autoOpenNowPlaying: typeof storedSettings.autoOpenNowPlaying === 'boolean' ? storedSettings.autoOpenNowPlaying : defaultSettings.autoOpenNowPlaying,
        trimSilence: typeof storedSettings.trimSilence === 'boolean' ? storedSettings.trimSilence : defaultSettings.trimSilence,
        volumeBoost: typeof storedSettings.volumeBoost === 'boolean' ? storedSettings.volumeBoost : defaultSettings.volumeBoost,
        autoUpdatePeriodMinutes: normalizeRefreshPeriod(Number(storedSettings.autoUpdatePeriodMinutes ?? defaultSettings.autoUpdatePeriodMinutes)),
      };
      if (preferencesMigrationVersion < 2) {
        try {
          const legacy = LocalLibrary.readLegacyPreferences();
          if (legacy.foundLegacyPreferences) {
            const legacyValues = legacy.legacyValues ?? {};
            nextSettings = {
              ...nextSettings,
              themeMode: legacy.themeMode,
              playbackSpeed: Math.min(2, Math.max(0.5, Math.round(legacy.playbackSpeed * 10) / 10)),
              autoPlayNext: legacy.autoPlayNext,
              markDeletedEpisodesAsPlayed: readLegacyBoolean(legacyValues, 'markplayedasdeleted', false),
              deleteDownloadedPlayedEpisodes: readLegacyBoolean(legacyValues, 'deleteDownloadedPlayedEpisodes', false),
              autoUpdatePeriodMinutes: normalizeRefreshPeriod(readLegacyNumber(legacyValues, 'autoUpdateEpisodePeriod_v2', 180)),
              ...mapLegacyDisplayPreferences(nextSettings, legacyValues),
            };
            await writeSetting('preferences', nextSettings);
            await writeSetting('legacyFlutterPreferences', legacy.legacyValues);
          }
          await writeSetting('legacyPreferencesMigrationVersion', 2);
        } catch (error) {
          console.warn('Legacy preferences could not be read; migration will be retried on the next launch.', error);
        }
      }

      if (preferencesMigrationVersion < 3) {
        try {
          const legacyValues = await readSetting<Record<string, string | number | boolean>>('legacyFlutterPreferences', {});
          nextSettings = {
            ...nextSettings,
            ...mapLegacyDisplayPreferences(nextSettings, legacyValues),
          };
          await writeSetting('preferences', nextSettings);
          await writeSetting('legacyPreferencesMigrationVersion', 3);
        } catch (error) {
          console.warn('Legacy layout/player settings could not be migrated; defaults remain available.', error);
        }
      }

      if (preferencesMigrationVersion < 4) {
        try {
          const legacyValues = await readSetting<Record<string, string | number | boolean>>('legacyFlutterPreferences', {});
          nextSettings = {
            ...nextSettings,
            ...mapLegacyAudioPreferences(nextSettings, legacyValues),
          };
          await writeSetting('preferences', nextSettings);
          await writeSetting('legacyPreferencesMigrationVersion', 4);
        } catch (error) {
          console.warn('Legacy audio-effect preferences could not be migrated; defaults remain available.', error);
        }
      }

      if (preferencesMigrationVersion < 5) {
        try {
          const legacyValues = await readSetting<Record<string, string | number | boolean>>('legacyFlutterPreferences', {});
          nextSettings = {
            ...nextSettings,
            ...mapLegacyBackgroundPreferences(nextSettings, legacyValues),
          };
          await writeSetting('preferences', nextSettings);
          await writeSetting('legacyPreferencesMigrationVersion', 5);
        } catch (error) {
          console.warn('Legacy background-refresh preferences could not be migrated; defaults remain available.', error);
        }
      }

      if (!alive) return;
      setSettings(nextSettings);
      void synchronizeBackgroundQuranRefresh(nextSettings).then((registration) => {
        if (nextSettings.backgroundRefreshEnabled && !registration.available) {
          console.info('Background Quran refresh requires a native development/production build; Expo Go does not support this task.');
        }
      }).catch((error: unknown) => {
        console.warn('The scheduled Quran feed refresh could not be synchronized.', error);
      });
      await refresh();
      if (!alive) return;
      const pendingDownloads = await listPendingAudioDownloads();
      if (pendingDownloads.length) {
        setDownloadProgress(Object.fromEntries(pendingDownloads.map((entry) => [entry.trackId, {
          bytesWritten: entry.bytesWritten,
          totalBytes: entry.totalBytes,
          percent: entry.totalBytes > 0 ? Math.min(100, Math.floor((entry.bytesWritten / entry.totalBytes) * 100)) : null,
          state: entry.resumeState ? 'paused' : 'downloading',
        }])));
      }
      setStartupError(null);
      setIsRetryingStartup(false);
      setReady(true);
      void maybeRefreshFeedRef.current(nextSettings.autoUpdatePeriodMinutes).catch((error: unknown) => {
        console.warn('Initial Quran feed refresh check failed.', error);
        setFeedSettled(true);
      });
    })().catch((error: unknown) => {
      if (!alive) return;
      const message = error instanceof Error && error.message.trim() ? error.message : 'Unknown storage error';
      console.error('Sheademtula startup could not initialize its local library.', error);
      setStartupError(message);
      setIsRetryingStartup(false);
      // Finish the splash/loading state so the user sees a recoverable error
      // screen instead of an indefinitely blank app.
      setFeedSettled(true);
      setReady(true);
    });
    return () => { alive = false; };
  }, [refresh, startupAttempt]);

  const importAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const failures: string[] = [];
      for (const asset of result.assets) {
        try {
          const copied = await LocalLibrary.copyAudioToLibrary(asset.uri, asset.name);
          await insertQuranAudio({
            id: createId(copied.uri, copied.sizeBytes),
            title: displayName(copied.fileName),
            artist: 'Sheikh Aadam Tuulaa',
            uri: copied.uri,
            fileName: copied.fileName,
            mimeType: asset.mimeType ?? null,
            sizeBytes: copied.sizeBytes,
          });
        } catch (error) {
          failures.push(`${asset.name}: ${error instanceof Error ? error.message : 'Import failed'}`);
        }
      }
      await refresh();
      if (failures.length) Alert.alert(localizeForLanguage(settings.language, 'some_files_import_failed_title'), failures.slice(0, 4).join('\n'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected audio could not be imported.';
      Alert.alert(localizeForLanguage(settings.language, 'import_failed_title'), message);
    }
  }, [refresh, settings.language]);

  const importLegacyBackup = useCallback(async () => {
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (selection.canceled || !selection.assets[0]) return;
      const file = new File(selection.assets[0].uri);
      const rawJson = await file.text();

      // Rescan the old app's private download directory before mapping Sembast
      // episode filenames to the files copied into the new private library.
      const legacyFiles = await LocalLibrary.importLegacyDownloads();
      for (const asset of legacyFiles.files) {
        await insertQuranAudio({
          id: createId(asset.uri, asset.sizeBytes),
          title: displayName(asset.fileName),
          artist: 'Sheikh Aadam Tuulaa',
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: null,
          sizeBytes: asset.sizeBytes,
        });
      }

      const existingDownloads = await listDownloadedQuranAudio();
      const result = await importLegacySembastExport(rawJson, existingDownloads);
      await refresh();
      if (result.alreadyImported) {
        Alert.alert(
          localizeForLanguage(settings.language, 'backup_already_imported_title'),
          localizeForLanguage(settings.language, 'backup_already_imported_message'),
        );
      } else {
        Alert.alert(
          localizeForLanguage(settings.language, 'flutter_backup_imported_title'),
          localizeForLanguage(settings.language, 'flutter_backup_imported_message', {
            episodes: result.importedEpisodes,
            transcripts: result.importedTranscripts,
            queue: result.restoredQueueItems,
            skipped: result.skippedRemoteEpisodes,
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The Flutter backup could not be imported.';
      Alert.alert(localizeForLanguage(settings.language, 'backup_import_failed_title'), message);
    }
  }, [refresh, settings.language]);

  const downloadTrack = useCallback(async (track: QuranAudio) => {
    if (track.localUri || activeDownloadIdsRef.current.has(track.id)) return;
    activeDownloadIdsRef.current.add(track.id);
    setDownloadProgress((current) => ({
      ...current,
      [track.id]: current[track.id] ?? { bytesWritten: 0, totalBytes: -1, percent: null, state: 'downloading' },
    }));
    let downloadedFile: { uri: string; fileName: string; sizeBytes: number; androidDownloadId?: string; iosDownloadId?: string } | null = null;
    let databaseLinked = false;
    let checkpointedPause = false;
    try {
      downloadedFile = await downloadQuranAudio(
        track.id,
        track.uri,
        track.fileName,
        (progress) => setDownloadProgress((current) => ({ ...current, [track.id]: progress })),
      );
      if (!downloadedFile) {
        checkpointedPause = true;
        return;
      }
      await setDownloadedUri(track.id, downloadedFile.uri, downloadedFile.fileName, downloadedFile.sizeBytes);
      databaseLinked = true;
      if (downloadedFile.androidDownloadId) {
        await cleanupCompletedAndroidQuranDownload(downloadedFile.androidDownloadId).catch((cleanupError: unknown) => {
          console.warn('The completed Android system download could not be cleaned up.', cleanupError);
        });
      }
      if (downloadedFile.iosDownloadId) {
        await cleanupCompletedIOSQuranDownload(downloadedFile.iosDownloadId).catch((cleanupError: unknown) => {
          console.warn('The completed iOS background download record could not be cleaned up.', cleanupError);
        });
      }
      await clearAudioDownload(track.id);
      await refresh();
    } catch (error) {
      if (downloadedFile && !databaseLinked) {
        await LocalLibrary.deleteAudioFromLibrary(downloadedFile.uri).catch((cleanupError: unknown) => {
          console.warn('A completed audio download could not be cleaned up after its database update failed.', cleanupError);
        });
      }
      if (!(error instanceof AudioDownloadCancelledError)) {
        const message = error instanceof Error ? error.message : 'The Quran audio could not be downloaded.';
        Alert.alert(localizeForLanguage(settings.language, 'download_failed_title'), message);
      }
    } finally {
      activeDownloadIdsRef.current.delete(track.id);
      if (!checkpointedPause) {
        setDownloadProgress((current) => {
          const next = { ...current };
          delete next[track.id];
          return next;
        });
      }
    }
  }, [refresh, settings.language]);

  const cancelDownload = useCallback((trackId: string) => {
    void cancelQuranAudioDownload(trackId).then(() => {
      activeDownloadIdsRef.current.delete(trackId);
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[trackId];
        return next;
      });
    }).catch((error: unknown) => {
      console.warn('Unable to cancel the Quran audio download.', error);
    });
  }, []);

  const recoverPendingDownloads = useCallback(async () => {
    if (downloadRecoveryInFlightRef.current) return;
    downloadRecoveryInFlightRef.current = true;
    try {
      await recoverOrphanedAndroidQuranDownloads(tracks);
      await recoverOrphanedIOSQuranDownloads(tracks);
      const pending = await listPendingAudioDownloads();
      for (const record of pending) {
        const track = tracks.find((entry) => entry.id === record.trackId);
        if (!track || track.localUri) {
          if (record.androidDownloadId) {
            await cleanupCompletedAndroidQuranDownload(record.androidDownloadId).catch((cleanupError: unknown) => {
              console.warn('A completed Android download left behind an orphaned system request.', cleanupError);
            });
          }
          if (record.iosDownloadId) {
            await cleanupCompletedIOSQuranDownload(record.iosDownloadId).catch((cleanupError: unknown) => {
              console.warn('A completed iOS download left behind an orphaned background task.', cleanupError);
            });
          }
          await clearAudioDownload(record.trackId);
          continue;
        }
        if (activeDownloadIdsRef.current.has(track.id)) continue;
        setDownloadProgress((current) => ({
          ...current,
          [track.id]: current[track.id] ?? {
            bytesWritten: record.bytesWritten,
            totalBytes: record.totalBytes,
            percent: record.totalBytes > 0 ? Math.min(100, Math.floor((record.bytesWritten / record.totalBytes) * 100)) : null,
            state: record.resumeState ? 'resuming' : 'downloading',
          },
        }));
        void downloadTrack(track);
      }
    } catch (error) {
      console.warn('Pending Quran audio downloads could not be recovered.', error);
    } finally {
      downloadRecoveryInFlightRef.current = false;
    }
  }, [downloadTrack, tracks]);

  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      void setQuranAudioAppActive(active).then(() => {
        if (!active) return;
        void refresh().catch((error: unknown) => {
          console.warn('Quran library could not be reloaded after background execution.', error);
        });
        void maybeRefreshFeed().catch((error: unknown) => {
          console.warn('Automatic Quran feed refresh failed.', error);
        });
        void recoverPendingDownloads();
      }).catch((error: unknown) => {
        console.warn('Quran audio downloads could not transition with the app lifecycle.', error);
      });
    });
    void setQuranAudioAppActive(AppState.currentState === 'active').then(() => {
      if (AppState.currentState === 'active') void recoverPendingDownloads();
    });
    return () => subscription.remove();
  }, [maybeRefreshFeed, ready, recoverPendingDownloads, refresh]);

  const removeTrack = useCallback(async (track: QuranAudio) => {
    try {
      if (activeDownloadIdsRef.current.has(track.id) || downloadProgress[track.id]) await cancelQuranAudioDownload(track.id);
      const ownedUri = track.localUri || (track.sourceType === 'local' ? track.uri : null);
      if (ownedUri) {
        const removed = await LocalLibrary.deleteAudioFromLibrary(ownedUri);
        if (!removed) throw new Error('The audio file could not be deleted.');
      }
      if (track.sourceType === 'featured-google-drive') {
        if (settings.markDeletedEpisodesAsPlayed) await setPlayed(track.id, true);
        await clearDownloadedUri(track.id);
      } else {
        await removeQuranAudio(track.id);
      }
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove the local audio file.';
      Alert.alert(localizeForLanguage(settings.language, 'delete_audio_failed_title'), message);
    }
  }, [downloadProgress, refresh, settings.markDeletedEpisodesAsPlayed, settings.language]);

  const setTrackPlayed = useCallback(async (trackId: string, played: boolean) => {
    await setPlayed(trackId, played);
    setTracks((current) => current.map((track) => track.id === trackId ? { ...track, isPlayed: played } : track));
    setDownloadedTracks((current) => current.map((track) => track.id === trackId ? { ...track, isPlayed: played } : track));
  }, []);

  const setAllFeedTracksPlayed = useCallback(async (played: boolean) => {
    // Commit to SQLite first so the UI never reports a bulk change that failed to persist.
    await setAllFeaturedQuranTracksPlayed(played);
    setTracks((current) => current.map((track) => (
      track.sourceType === 'featured-google-drive' ? { ...track, isPlayed: played } : track
    )));
    setDownloadedTracks((current) => current.map((track) => (
      track.sourceType === 'featured-google-drive' ? { ...track, isPlayed: played } : track
    )));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<LibrarySettings>) => {
    const next = { ...settings, ...patch };
    if (patch.autoUpdatePeriodMinutes !== undefined) {
      next.autoUpdatePeriodMinutes = normalizeRefreshPeriod(patch.autoUpdatePeriodMinutes);
    }
    if (patch.layoutMode !== undefined) next.layoutMode = normalizeLayoutMode(patch.layoutMode);
    if (patch.layoutOrder !== undefined) next.layoutOrder = normalizeLayoutOrder(patch.layoutOrder);
    setSettings(next);
    await writeSetting('preferences', next);
    if (
      patch.backgroundRefreshEnabled !== undefined ||
      patch.autoUpdatePeriodMinutes !== undefined
    ) {
      void synchronizeBackgroundQuranRefresh(next).then((registration) => {
        if (next.backgroundRefreshEnabled && !registration.available) {
          console.info('Background Quran refresh requires a native development/production build; Expo Go does not support this task.');
        }
      }).catch((error: unknown) => {
        console.warn('The scheduled Quran feed refresh could not be synchronized.', error);
      });
    }
    if (patch.autoUpdatePeriodMinutes !== undefined) {
      void maybeRefreshFeed(next.autoUpdatePeriodMinutes).catch((error: unknown) => {
        console.warn('Quran feed refresh after settings change failed.', error);
      });
    }
  }, [maybeRefreshFeed, settings]);


  const markFeedTrackSeen = useCallback((trackId: string) => {
    const current = newFeaturedTrackIdsRef.current;
    if (!current.includes(trackId)) return;
    const next = current.filter((id) => id !== trackId);
    newFeaturedTrackIdsRef.current = next;
    setNewFeaturedTrackIds(next);
    void writeSetting('newFeaturedTrackIds', next).catch((error: unknown) => {
      console.warn('Unable to persist the seen Quran feed item marker.', error);
    });
  }, []);

  const value = useMemo(() => ({
    ready, startupError, isRetryingStartup, retryStartup, feedSettled, feedLoading, feedError, tracks, downloadedTracks, downloadProgress, newFeaturedTrackIds, settings,
    importAudio, importLegacyBackup, downloadTrack, cancelDownload, removeTrack, refresh, refreshFeed, updateSettings, markFeedTrackSeen, setTrackPlayed, setAllFeedTracksPlayed,
  }), [ready, startupError, isRetryingStartup, retryStartup, feedSettled, feedLoading, feedError, tracks, downloadedTracks, downloadProgress, newFeaturedTrackIds, settings,
    importAudio, importLegacyBackup, downloadTrack, cancelDownload, removeTrack, refresh, refreshFeed, updateSettings, markFeedTrackSeen, setTrackPlayed, setAllFeedTracksPlayed]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useQuranLibrary() {
  const context = useContext(Context);
  if (!context) throw new Error('useQuranLibrary must be used inside QuranLibraryProvider');
  return context;
}
