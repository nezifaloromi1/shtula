import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type IOSDownloadState = 'pending' | 'running' | 'successful' | 'failed' | 'cancelled' | 'missing';

export type IOSDownloadStatus = {
  status: IOSDownloadState;
  bytesWritten: number;
  totalBytes: number;
  reason: string | null;
};

export type IOSDownloadResult = {
  uri: string;
  fileName: string;
  sizeBytes: number;
};

export type TrackedIOSDownload = {
  trackId: string;
  downloadId: string;
  requestUrl: string;
  fileName: string;
};

type NativeIOSDownloads = {
  enqueue(trackId: string, requestUrl: string, requestedFileName: string): Promise<{ downloadId: string }>;
  listTrackedDownloads(): Promise<TrackedIOSDownload[]>;
  getStatus(downloadId: string): Promise<IOSDownloadStatus>;
  finalizeDownload(downloadId: string): Promise<IOSDownloadResult>;
  cancel(downloadId: string): Promise<boolean>;
  cleanup(downloadId: string): Promise<boolean>;
};

const nativeDownloads = Platform.OS === 'ios'
  ? requireOptionalNativeModule<NativeIOSDownloads>('SheademtulaIOSDownloads')
  : null;

export function isIOSBackgroundDownloadsAvailable(): boolean {
  return Platform.OS === 'ios' && nativeDownloads !== null;
}

function requireNative(): NativeIOSDownloads {
  if (!nativeDownloads) throw new Error('The iOS background download service is unavailable in this app build.');
  return nativeDownloads;
}

export default {
  enqueue: (trackId: string, requestUrl: string, requestedFileName: string) =>
    requireNative().enqueue(trackId, requestUrl, requestedFileName),
  listTrackedDownloads: () => requireNative().listTrackedDownloads(),
  getStatus: (downloadId: string) => requireNative().getStatus(downloadId),
  finalizeDownload: (downloadId: string) => requireNative().finalizeDownload(downloadId),
  cancel: (downloadId: string) => requireNative().cancel(downloadId),
  cleanup: (downloadId: string) => requireNative().cleanup(downloadId),
};
