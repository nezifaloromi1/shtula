import { Directory, DownloadTask, File, type DownloadPauseState } from 'expo-file-system';
import { Platform } from 'react-native';
import LocalLibrary from '../../../../modules/sheademtula-local-library';
import AndroidDownloads, { isAndroidDownloadManagerAvailable } from '../../../../modules/sheademtula-android-downloads';
import IOSDownloads, { isIOSBackgroundDownloadsAvailable } from '../../../../modules/sheademtula-ios-downloads';
import {
  clearAudioDownload,
  listPendingAudioDownloads,
  saveAudioDownload,
  saveAudioDownloadResumeState,
  updateAudioDownloadProgress,
  type StoredAudioDownload,
} from '@/storage/database';

export type AudioDownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
  percent: number | null;
  state?: 'downloading' | 'paused' | 'resuming';
};

export class AudioDownloadCancelledError extends Error {
  constructor() {
    super('The audio download was cancelled.');
    this.name = 'AudioDownloadCancelledError';
  }
}

export type DownloadedQuranAudio = { uri: string; fileName: string; sizeBytes: number; androidDownloadId?: string; iosDownloadId?: string };

type ActiveDownload = {
  task: DownloadTask;
  destination: File;
  requestUrl: string;
  fileName: string;
  cancelled: boolean;
  pauseRequested: boolean;
  pausePromise: Promise<void> | null;
  preserveResumeState: boolean;
  bytesWritten: number;
  totalBytes: number;
  onProgress: (progress: AudioDownloadProgress) => void;
};

const activeDownloads = new Map<string, ActiveDownload>();
type ActiveAndroidDownload = { downloadId: string | null; cancelled: boolean };
const activeAndroidDownloads = new Map<string, ActiveAndroidDownload>();
type ActiveIOSDownload = { downloadId: string | null; cancelled: boolean };
const activeIOSDownloads = new Map<string, ActiveIOSDownload>();
const PROGRESS_PERSIST_INTERVAL_MS = 1_000;
let appIsActive = true;
let lifecycleTransition: Promise<void> = Promise.resolve();

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 140);
  return cleaned || 'quran-audio.mp3';
}

function uniqueDestination(directory: Directory, requestedName: string): File {
  const fileName = safeFileName(requestedName);
  const extensionIndex = fileName.lastIndexOf('.');
  const base = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : '';

  let candidate = new File(directory, fileName);
  let suffix = 2;
  while (candidate.exists) {
    candidate = new File(directory, `${base} (${suffix})${extension}`);
    suffix += 1;
  }
  return candidate;
}

function parseResumeState(value: unknown, requestUrl: string, destinationUri: string): DownloadPauseState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<DownloadPauseState>;
  if (state.url !== requestUrl || state.fileUri !== destinationUri || state.isDirectory !== false) return null;
  // `resumeData` is optional in SDK 58 DownloadPauseState; fromSavable owns
  // the platform-specific interpretation, so validate its type only when set.
  if (state.resumeData !== undefined && typeof state.resumeData !== 'string') return null;
  return state as DownloadPauseState;
}

function toProgress(bytesWritten: number, totalBytes: number, state: AudioDownloadProgress['state'] = 'downloading'): AudioDownloadProgress {
  return {
    bytesWritten: Math.max(0, bytesWritten),
    totalBytes,
    percent: totalBytes > 0 ? Math.min(100, Math.floor((bytesWritten / totalBytes) * 100)) : null,
    state,
  };
}

function validateDownloadedFile(file: File): DownloadedQuranAudio {
  if (!file.exists || !file.size || file.size <= 0) throw new Error('The downloaded audio file is empty.');
  const mimeType = (file.type || '').toLowerCase();
  if (mimeType.includes('text/html') || mimeType.includes('application/json') || mimeType.includes('application/xml')) {
    throw new Error('Google Drive returned a web page or metadata document instead of an audio file. Check the sharing permissions for the feed enclosure.');
  }
  return { uri: file.uri, fileName: file.name, sizeBytes: file.size };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function downloadWithAndroidSystemManager(
  trackId: string,
  remoteUrl: string,
  requestedName: string,
  onProgress: (progress: AudioDownloadProgress) => void,
): Promise<DownloadedQuranAudio | null> {
  if (activeAndroidDownloads.has(trackId)) throw new Error('This audio item is already downloading.');
  const active: ActiveAndroidDownload = { downloadId: null, cancelled: false };
  activeAndroidDownloads.set(trackId, active);
  let id: string | null = null;
  try {
    let stored = (await listPendingAudioDownloads()).find((entry) => entry.trackId === trackId) ?? null;
    if (stored && stored.requestUrl !== remoteUrl) {
      if (stored.androidDownloadId) await AndroidDownloads.cancel(stored.androidDownloadId).catch(() => undefined);
      else if (!stored.destinationUri.startsWith('android-download://')) {
        const oldFile = new File(stored.destinationUri);
        if (oldFile.exists) oldFile.delete();
      }
      await clearAudioDownload(trackId);
      stored = null;
    }

    if (stored && !stored.androidDownloadId && !stored.destinationUri.startsWith('android-download://')) {
      // The previous Android build used Expo FileSystem pause snapshots; migrate
      // those incomplete files to the system DownloadManager without keeping them.
      const legacyPartial = new File(stored.destinationUri);
      if (legacyPartial.exists) legacyPartial.delete();
    }
    // SharedPreferences is the source of native task metadata if the SQLite
    // write was interrupted. Verify its URL before reattaching so a refreshed
    // feed item cannot accidentally inherit an old request for the same track ID.
    const nativeRecord = (await AndroidDownloads.listTrackedDownloads())
      .find((entry) => entry.trackId === trackId) ?? null;
    if (nativeRecord && nativeRecord.requestUrl !== remoteUrl) {
      await AndroidDownloads.cancel(nativeRecord.downloadId).catch(() => undefined);
    }
    id = stored?.androidDownloadId ?? (nativeRecord?.requestUrl === remoteUrl ? nativeRecord.downloadId : null);
    if (!id) {
      const queued = await AndroidDownloads.enqueue(trackId, remoteUrl, requestedName);
      id = queued.downloadId;
    }
    active.downloadId = id;
    if (active.cancelled) {
      await AndroidDownloads.cancel(id);
      throw new AudioDownloadCancelledError();
    }

    await saveAudioDownload({
      trackId,
      requestUrl: remoteUrl,
      destinationUri: `android-download://${id}`,
      fileName: safeFileName(requestedName),
      bytesWritten: stored?.bytesWritten ?? 0,
      totalBytes: stored?.totalBytes ?? -1,
      resumeState: null,
      androidDownloadId: id,
    });

    let lastPersistedAt = 0;
    while (true) {
      if (active.cancelled) throw new AudioDownloadCancelledError();
      // Android's system DownloadManager continues the HTTP transfer outside the
      // React Native process. Stop only this JS observer while the app is hidden.
      if (!appIsActive) return null;

      const status = await AndroidDownloads.getStatus(id);
      const progressState = status.status === 'paused' ? 'paused' : 'downloading';
      const progress = toProgress(status.bytesWritten, status.totalBytes, progressState);
      onProgress(progress);
      const now = Date.now();
      if (now - lastPersistedAt >= PROGRESS_PERSIST_INTERVAL_MS) {
        lastPersistedAt = now;
        await updateAudioDownloadProgress(trackId, progress.bytesWritten, progress.totalBytes);
      }

      if (status.status === 'successful') {
        try {
          const result = await AndroidDownloads.finalizeDownload(id, requestedName);
          onProgress(toProgress(result.sizeBytes, result.sizeBytes));
          return { ...result, androidDownloadId: id };
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (/web page|metadata document|error response|file is empty/i.test(message)) {
            await AndroidDownloads.cleanup(id).catch(() => undefined);
            await clearAudioDownload(trackId);
          }
          // Keep the completed system task for retry if moving it into internal
          // storage failed (for example, transient storage pressure).
          throw error;
        }
      }
      if (status.status === 'failed') {
        await AndroidDownloads.cleanup(id).catch(() => undefined);
        await clearAudioDownload(trackId);
        throw new Error(`Android could not complete this Quran audio download (reason ${status.reason}).`);
      }
      if (status.status === 'missing') {
        await AndroidDownloads.cleanup(id).catch(() => undefined);
        await clearAudioDownload(trackId);
        throw new Error('The system download record is no longer available. Start the download again.');
      }
      await wait(900);
    }
  } catch (error) {
    if (active.cancelled || error instanceof AudioDownloadCancelledError) {
      if (id) await AndroidDownloads.cancel(id).catch(() => undefined);
      await clearAudioDownload(trackId).catch(() => undefined);
      throw new AudioDownloadCancelledError();
    }
    throw error;
  } finally {
    if (activeAndroidDownloads.get(trackId) === active) activeAndroidDownloads.delete(trackId);
  }
}

export async function cleanupCompletedAndroidQuranDownload(downloadId: string): Promise<void> {
  if (!isAndroidDownloadManagerAvailable()) return;
  await AndroidDownloads.cleanup(downloadId);
}

async function downloadWithIOSBackgroundSession(
  trackId: string,
  remoteUrl: string,
  requestedName: string,
  onProgress: (progress: AudioDownloadProgress) => void,
): Promise<DownloadedQuranAudio | null> {
  if (activeIOSDownloads.has(trackId)) throw new Error('This audio item is already downloading.');
  const active: ActiveIOSDownload = { downloadId: null, cancelled: false };
  activeIOSDownloads.set(trackId, active);
  let id: string | null = null;
  try {
    let stored = (await listPendingAudioDownloads()).find((entry) => entry.trackId === trackId) ?? null;
    if (stored && stored.requestUrl !== remoteUrl) {
      if (stored.iosDownloadId) await IOSDownloads.cancel(stored.iosDownloadId).catch(() => undefined);
      else if (!stored.destinationUri.startsWith('ios-background-download://')) {
        const oldFile = new File(stored.destinationUri);
        if (oldFile.exists) oldFile.delete();
      }
      await clearAudioDownload(trackId);
      stored = null;
    }

    const nativeRecord = (await IOSDownloads.listTrackedDownloads())
      .find((entry) => entry.trackId === trackId) ?? null;
    if (nativeRecord && nativeRecord.requestUrl !== remoteUrl) {
      await IOSDownloads.cancel(nativeRecord.downloadId).catch(() => undefined);
    }
    id = stored?.iosDownloadId ?? (nativeRecord?.requestUrl === remoteUrl ? nativeRecord.downloadId : null);
    if (!id) {
      const queued = await IOSDownloads.enqueue(trackId, remoteUrl, requestedName);
      id = queued.downloadId;
    }
    active.downloadId = id;
    if (active.cancelled) {
      await IOSDownloads.cancel(id);
      throw new AudioDownloadCancelledError();
    }

    await saveAudioDownload({
      trackId,
      requestUrl: remoteUrl,
      destinationUri: `ios-background-download://${id}`,
      fileName: safeFileName(requestedName),
      bytesWritten: stored?.bytesWritten ?? 0,
      totalBytes: stored?.totalBytes ?? -1,
      resumeState: null,
      iosDownloadId: id,
    });

    let lastPersistedAt = 0;
    while (true) {
      if (active.cancelled) throw new AudioDownloadCancelledError();
      // The URLSession transfer continues in the system networking process.
      // Stop only JS polling while the app is backgrounded or suspended.
      if (!appIsActive) return null;

      const status = await IOSDownloads.getStatus(id);
      const progress = toProgress(status.bytesWritten, status.totalBytes);
      onProgress(progress);
      const now = Date.now();
      if (now - lastPersistedAt >= PROGRESS_PERSIST_INTERVAL_MS) {
        lastPersistedAt = now;
        await updateAudioDownloadProgress(trackId, progress.bytesWritten, progress.totalBytes);
      }

      if (status.status === 'successful') {
        const result = await IOSDownloads.finalizeDownload(id);
        onProgress(toProgress(result.sizeBytes, result.sizeBytes));
        return { ...result, iosDownloadId: id };
      }
      if (status.status === 'failed' || status.status === 'cancelled') {
        await IOSDownloads.cleanup(id).catch(() => undefined);
        await clearAudioDownload(trackId);
        throw new Error(status.reason || 'iOS could not complete this Quran audio download.');
      }
      if (status.status === 'missing') {
        await IOSDownloads.cleanup(id).catch(() => undefined);
        await clearAudioDownload(trackId);
        throw new Error('The iOS background download record is no longer available. Start the download again.');
      }
      await wait(900);
    }
  } catch (error) {
    if (active.cancelled || error instanceof AudioDownloadCancelledError) {
      if (id) await IOSDownloads.cancel(id).catch(() => undefined);
      await clearAudioDownload(trackId).catch(() => undefined);
      throw new AudioDownloadCancelledError();
    }
    throw error;
  } finally {
    if (activeIOSDownloads.get(trackId) === active) activeIOSDownloads.delete(trackId);
  }
}

export async function cleanupCompletedIOSQuranDownload(downloadId: string): Promise<void> {
  if (!isIOSBackgroundDownloadsAvailable()) return;
  const status = await IOSDownloads.getStatus(downloadId).catch(() => ({ status: 'missing' as const, bytesWritten: 0, totalBytes: -1, reason: null }));
  if (status.status === 'pending' || status.status === 'running') {
    await IOSDownloads.cancel(downloadId);
  } else {
    await IOSDownloads.cleanup(downloadId);
  }
}

export async function recoverOrphanedIOSQuranDownloads(
  tracks: ReadonlyArray<{ id: string; uri: string; fileName: string; localUri: string | null }>,
): Promise<void> {
  if (!isIOSBackgroundDownloadsAvailable()) return;
  const [tracked, pending] = await Promise.all([
    IOSDownloads.listTrackedDownloads(),
    listPendingAudioDownloads(),
  ]);
  const pendingTrackIds = new Set(pending.map((entry) => entry.trackId));
  for (const nativeRecord of tracked) {
    if (pendingTrackIds.has(nativeRecord.trackId)) continue;
    const track = tracks.find((entry) => entry.id === nativeRecord.trackId);
    if (!track || nativeRecord.requestUrl !== track.uri) {
      await IOSDownloads.cancel(nativeRecord.downloadId).catch(() => undefined);
      continue;
    }
    const status = await IOSDownloads.getStatus(nativeRecord.downloadId);
    if (track.localUri) {
      if (status.status === 'successful') await IOSDownloads.cleanup(nativeRecord.downloadId).catch(() => undefined);
      else await IOSDownloads.cancel(nativeRecord.downloadId).catch(() => undefined);
      continue;
    }
    if (status.status === 'missing' || status.status === 'failed' || status.status === 'cancelled') {
      await IOSDownloads.cleanup(nativeRecord.downloadId).catch(() => undefined);
      continue;
    }
    await saveAudioDownload({
      trackId: track.id,
      requestUrl: nativeRecord.requestUrl,
      destinationUri: `ios-background-download://${nativeRecord.downloadId}`,
      fileName: track.fileName || nativeRecord.fileName,
      bytesWritten: status.bytesWritten,
      totalBytes: status.totalBytes,
      resumeState: null,
      iosDownloadId: nativeRecord.downloadId,
    });
  }
}

export async function recoverOrphanedAndroidQuranDownloads(
  tracks: ReadonlyArray<{ id: string; uri: string; fileName: string; localUri: string | null }>,
): Promise<void> {
  if (!isAndroidDownloadManagerAvailable()) return;
  const [tracked, pending] = await Promise.all([
    AndroidDownloads.listTrackedDownloads(),
    listPendingAudioDownloads(),
  ]);
  const pendingTrackIds = new Set(pending.map((entry) => entry.trackId));
  for (const nativeRecord of tracked) {
    if (pendingTrackIds.has(nativeRecord.trackId)) continue;
    const track = tracks.find((entry) => entry.id === nativeRecord.trackId);
    if (!track || track.localUri || nativeRecord.requestUrl !== track.uri) {
      await AndroidDownloads.cleanup(nativeRecord.downloadId).catch((error: unknown) => {
        console.warn('An orphaned Android Quran download could not be removed.', error);
      });
      continue;
    }
    const status = await AndroidDownloads.getStatus(nativeRecord.downloadId);
    if (status.status === 'missing' || status.status === 'failed') {
      await AndroidDownloads.cleanup(nativeRecord.downloadId).catch(() => undefined);
      continue;
    }
    await saveAudioDownload({
      trackId: track.id,
      requestUrl: nativeRecord.requestUrl,
      destinationUri: `android-download://${nativeRecord.downloadId}`,
      fileName: track.fileName || nativeRecord.fileName,
      bytesWritten: status.bytesWritten,
      totalBytes: status.totalBytes,
      resumeState: null,
      androidDownloadId: nativeRecord.downloadId,
    });
  }
}

async function createTask(
  trackId: string,
  remoteUrl: string,
  requestedName: string,
  onProgress: (progress: AudioDownloadProgress) => void,
): Promise<{ task: DownloadTask | null; destination: File; record: StoredAudioDownload | null; completedFile?: File }> {
  const directory = new Directory(LocalLibrary.getLibraryDirectory());
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  const stored = (await listPendingAudioDownloads()).find((entry) => entry.trackId === trackId) ?? null;
  if (stored && stored.requestUrl === remoteUrl) {
    const destination = new File(stored.destinationUri);
    const resumeState = parseResumeState(stored.resumeState, remoteUrl, stored.destinationUri);
    if (resumeState) {
      try {
        const task = DownloadTask.fromSavable(resumeState, {
          onProgress: ({ bytesWritten, totalBytes }) => onProgress(toProgress(bytesWritten, totalBytes)),
        });
        onProgress(toProgress(stored.bytesWritten, stored.totalBytes, 'resuming'));
        return { task, destination, record: stored };
      } catch (error) {
        console.warn('A saved Quran audio resume state could not be restored; the download will restart.', error);
      }
    } else if (destination.exists && destination.size > 0 && stored.totalBytes > 0 && destination.size === stored.totalBytes) {
      // Recover the narrow crash window after the native transfer completed but
      // before the provider linked the completed file into quran_audio.
      return { task: null, destination, record: stored, completedFile: destination };
    }
  }

  if (stored) {
    const oldFile = new File(stored.destinationUri);
    if (oldFile.exists) oldFile.delete();
    await clearAudioDownload(trackId);
  }

  const destination = uniqueDestination(directory, requestedName);
  const task = File.createDownloadTask(remoteUrl, destination, {
    // The app checkpoints and resumes this task across AppState transitions.
    // Expo's background session does not restore its JS task after relaunch.
    sessionType: 'foreground',
    onProgress: ({ bytesWritten, totalBytes }) => onProgress(toProgress(bytesWritten, totalBytes)),
  });
  await saveAudioDownload({
    trackId,
    requestUrl: remoteUrl,
    destinationUri: destination.uri,
    fileName: destination.name,
    bytesWritten: 0,
    totalBytes: -1,
    resumeState: null,
  });
  return { task, destination, record: null };
}

export async function downloadQuranAudio(
  trackId: string,
  remoteUrl: string,
  requestedName: string,
  onProgress: (progress: AudioDownloadProgress) => void,
): Promise<DownloadedQuranAudio | null> {
  const url = new URL(remoteUrl);
  if (url.protocol !== 'https:') throw new Error('Only secure HTTPS audio downloads are supported.');
  if (Platform.OS === 'android' && isAndroidDownloadManagerAvailable()) {
    return downloadWithAndroidSystemManager(trackId, remoteUrl, requestedName, onProgress);
  }
  if (Platform.OS === 'ios' && isIOSBackgroundDownloadsAvailable()) {
    const stored = (await listPendingAudioDownloads()).find((entry) => entry.trackId === trackId) ?? null;
    // Keep in-flight Expo FileSystem checkpoints from older app versions resumable.
    // All new iOS transfers use URLSession, including tasks already created by it.
    if (!stored || stored.iosDownloadId || stored.destinationUri.startsWith('ios-background-download://')) {
      return downloadWithIOSBackgroundSession(trackId, remoteUrl, requestedName, onProgress);
    }
  }
  if (activeDownloads.has(trackId)) throw new Error('This audio item is already downloading.');

  let active: ActiveDownload | null = null;
  let lastProgressAt = 0;
  let lastPersistedAt = 0;
  try {
    const created = await createTask(trackId, remoteUrl, requestedName, (progress) => {
      const current = activeDownloads.get(trackId);
      if (current) {
        current.bytesWritten = progress.bytesWritten;
        current.totalBytes = progress.totalBytes;
      }
      const now = Date.now();
      if (now - lastProgressAt >= 350 || (progress.totalBytes > 0 && progress.bytesWritten >= progress.totalBytes)) {
        lastProgressAt = now;
        onProgress(progress);
      }
      if (now - lastPersistedAt >= PROGRESS_PERSIST_INTERVAL_MS) {
        lastPersistedAt = now;
        void updateAudioDownloadProgress(trackId, progress.bytesWritten, progress.totalBytes).catch((error: unknown) => {
          console.warn('Unable to persist Quran audio download progress.', error);
        });
      }
    });
    if (created.completedFile) return validateDownloadedFile(created.completedFile);
    if (!created.task) throw new Error('The Quran audio download task could not be created.');
    active = {
      task: created.task,
      destination: created.destination,
      requestUrl: remoteUrl,
      fileName: created.destination.name,
      cancelled: false,
      pauseRequested: false,
      pausePromise: null,
      preserveResumeState: Boolean(created.record?.resumeState),
      bytesWritten: created.record?.bytesWritten ?? 0,
      totalBytes: created.record?.totalBytes ?? -1,
      onProgress,
    };
    activeDownloads.set(trackId, active);
    if (!appIsActive) {
      onProgress(toProgress(active.bytesWritten, active.totalBytes, 'paused'));
      return null;
    }

    const file = created.record ? await active.task.resumeAsync() : await active.task.downloadAsync();
    if (active.pauseRequested) {
      await active.pausePromise;
      return null;
    }
    if (active.cancelled) throw new AudioDownloadCancelledError();
    if (!file) throw new Error('The download was paused before it finished and could not be saved for recovery.');

    const result = validateDownloadedFile(file);
    await updateAudioDownloadProgress(trackId, result.sizeBytes, result.sizeBytes);
    return result;
  } catch (error) {
    if (active?.pauseRequested) {
      await active.pausePromise;
      return null;
    }
    if (active?.cancelled || error instanceof AudioDownloadCancelledError) {
      if (active?.destination.exists) active.destination.delete();
      await clearAudioDownload(trackId).catch(() => undefined);
      throw new AudioDownloadCancelledError();
    }
    if (active?.preserveResumeState && active.destination.exists) {
      // A transient failure while resuming must not discard the last durable
      // checkpoint. A later user retry or foreground recovery can reconstruct it.
      console.warn('A resumed Quran audio download failed; its saved checkpoint was retained for retry.', error);
      throw error;
    }
    if (active?.destination.exists) active.destination.delete();
    await clearAudioDownload(trackId).catch(() => undefined);
    throw error;
  } finally {
    if (active) {
      if (activeDownloads.get(trackId) === active) activeDownloads.delete(trackId);
      active.task.release();
    }
  }
}

async function persistPause(trackId: string, active: ActiveDownload): Promise<void> {
  try {
    await active.task.pauseAsync();
    const resumeState = active.task.savable();
    await saveAudioDownloadResumeState(trackId, resumeState, active.bytesWritten, active.totalBytes);
    active.onProgress(toProgress(active.bytesWritten, active.totalBytes, 'paused'));
  } catch (error) {
    // If the platform cannot produce a durable paused-task snapshot, restart
    // from zero on the next foreground instead of trusting an incomplete file.
    try {
      await saveAudioDownload({
        trackId,
        requestUrl: active.requestUrl,
        destinationUri: active.destination.uri,
        fileName: active.fileName,
        bytesWritten: 0,
        totalBytes: active.totalBytes,
        resumeState: null,
      });
    } catch (persistError) {
      console.warn('The fallback Quran audio download state could not be persisted.', persistError);
    } finally {
      try { active.task.cancel(); } catch (cancelError) {
        console.warn('The uncheckpointed Quran audio task could not be cancelled.', cancelError);
      }
      if (active.destination.exists) active.destination.delete();
      active.onProgress(toProgress(0, active.totalBytes, 'paused'));
    }
    console.warn('Quran audio download could not be checkpointed and will restart from zero.', error);
  }
}

export function setQuranAudioAppActive(isActive: boolean): Promise<void> {
  // A failed checkpoint must not permanently poison the lifecycle queue: a later
  // foreground transition still needs a chance to recover pending downloads.
  lifecycleTransition = lifecycleTransition.catch(() => undefined).then(async () => {
    appIsActive = isActive;
    if (!isActive && !(Platform.OS === 'android' && isAndroidDownloadManagerAvailable())) {
      await pauseActiveQuranAudioDownloads();
    }
  });
  return lifecycleTransition;
}

export async function pauseActiveQuranAudioDownloads(): Promise<void> {
  const active = [...activeDownloads.entries()];
  await Promise.all(active.map(async ([trackId, download]) => {
    if (download.cancelled || download.pauseRequested || download.task.state !== 'active') return;
    download.pauseRequested = true;
    download.pausePromise = persistPause(trackId, download);
    await download.pausePromise;
  }));
}

export async function cancelQuranAudioDownload(trackId: string): Promise<boolean> {
  const iosActive = activeIOSDownloads.get(trackId);
  if (iosActive) {
    iosActive.cancelled = true;
    const storedId = iosActive.downloadId ?? (await IOSDownloads.listTrackedDownloads().catch(() => []))
      .find((entry) => entry.trackId === trackId)?.downloadId ?? null;
    if (storedId && isIOSBackgroundDownloadsAvailable()) await IOSDownloads.cancel(storedId);
    await clearAudioDownload(trackId).catch((error: unknown) => {
      console.warn('Unable to clear the cancelled iOS Quran download record.', error);
    });
    return true;
  }
  const androidActive = activeAndroidDownloads.get(trackId);
  if (androidActive) {
    androidActive.cancelled = true;
    const storedId = androidActive.downloadId ?? await AndroidDownloads.findDownloadForTrack(trackId).catch(() => null);
    if (storedId && isAndroidDownloadManagerAvailable()) await AndroidDownloads.cancel(storedId);
    await clearAudioDownload(trackId).catch((error: unknown) => {
      console.warn('Unable to clear the cancelled Android Quran download record.', error);
    });
    return true;
  }
  const active = activeDownloads.get(trackId);
  if (active) {
    active.cancelled = true;
    active.task.cancel();
    await clearAudioDownload(trackId).catch((error: unknown) => {
      console.warn('Unable to clear the cancelled Quran audio download record.', error);
    });
    return true;
  }
  const stored = (await listPendingAudioDownloads()).find((entry) => entry.trackId === trackId);
  if (!stored) {
    if (isAndroidDownloadManagerAvailable()) {
      const orphanId = await AndroidDownloads.findDownloadForTrack(trackId);
      if (orphanId) return AndroidDownloads.cancel(orphanId);
    }
    if (isIOSBackgroundDownloadsAvailable()) {
      const orphan = (await IOSDownloads.listTrackedDownloads()).find((entry) => entry.trackId === trackId);
      if (orphan) return IOSDownloads.cancel(orphan.downloadId);
    }
    return false;
  }
  if (stored.iosDownloadId && isIOSBackgroundDownloadsAvailable()) {
    await IOSDownloads.cancel(stored.iosDownloadId);
    await clearAudioDownload(trackId);
    return true;
  }
  if (stored.androidDownloadId && isAndroidDownloadManagerAvailable()) {
    await AndroidDownloads.cancel(stored.androidDownloadId);
    await clearAudioDownload(trackId);
    return true;
  }
  const destination = new File(stored.destinationUri);
  if (destination.exists) destination.delete();
  await clearAudioDownload(trackId);
  return true;
}
