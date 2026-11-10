import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type AndroidDownloadState = 'pending' | 'running' | 'paused' | 'successful' | 'failed' | 'missing';

export type AndroidDownloadStatus = {
  status: AndroidDownloadState;
  bytesWritten: number;
  totalBytes: number;
  reason: number;
};

export type AndroidDownloadResult = {
  uri: string;
  fileName: string;
  sizeBytes: number;
};

export type TrackedAndroidDownload = { trackId: string; downloadId: string; requestUrl: string; fileName: string };

type NativeAndroidDownloads = {
  enqueue(trackId: string, requestUrl: string, requestedFileName: string): Promise<{ downloadId: string }>;
  findDownloadForTrack(trackId: string): Promise<string | null>;
  listTrackedDownloads(): Promise<TrackedAndroidDownload[]>;
  getStatus(downloadId: string): Promise<AndroidDownloadStatus>;
  finalizeDownload(downloadId: string, requestedFileName: string): Promise<AndroidDownloadResult>;
  cancel(downloadId: string): Promise<boolean>;
  cleanup(downloadId: string): Promise<boolean>;
};

const nativeDownloads = Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeAndroidDownloads>('SheademtulaAndroidDownloads')
  : null;

export function isAndroidDownloadManagerAvailable(): boolean {
  return Platform.OS === 'android' && nativeDownloads !== null;
}

function requireNative(): NativeAndroidDownloads {
  if (!nativeDownloads) throw new Error('The Android system download service is unavailable in this app build.');
  return nativeDownloads;
}

export default {
  enqueue: (trackId: string, requestUrl: string, requestedFileName: string) =>
    requireNative().enqueue(trackId, requestUrl, requestedFileName),
  findDownloadForTrack: (trackId: string) => requireNative().findDownloadForTrack(trackId),
  listTrackedDownloads: () => requireNative().listTrackedDownloads(),
  getStatus: (downloadId: string) => requireNative().getStatus(downloadId),
  finalizeDownload: (downloadId: string, requestedFileName: string) =>
    requireNative().finalizeDownload(downloadId, requestedFileName),
  cancel: (downloadId: string) => requireNative().cancel(downloadId),
  cleanup: (downloadId: string) => requireNative().cleanup(downloadId),
};
