import { requireNativeModule } from 'expo-modules-core';

export type ImportedAudioAsset = {
  uri: string;
  fileName: string;
  sizeBytes: number;
};

export type LegacyDownloadImportResult = {
  foundLegacyDirectory: boolean;
  files: ImportedAudioAsset[];
};

export type LegacyPreferences = {
  foundLegacyPreferences: boolean;
  themeMode: 'system' | 'light' | 'dark';
  playbackSpeed: number;
  autoPlayNext: boolean;
  legacyValues: Record<string, string | number | boolean>;
};

type NativeLocalLibrary = {
  readLegacyPreferences(): LegacyPreferences;
  copyAudioToLibrary(sourceUri: string, requestedName: string): Promise<ImportedAudioAsset>;
  importLegacyDownloads(): Promise<LegacyDownloadImportResult>;
  deleteAudioFromLibrary(uri: string): Promise<boolean>;
  getLibraryDirectory(): string;
};

const nativeLibrary = requireNativeModule<NativeLocalLibrary>('SheademtulaLocalLibrary');
export const readLegacyPreferences = () => nativeLibrary.readLegacyPreferences();
export default nativeLibrary;
