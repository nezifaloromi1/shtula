export function formatAudioBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Audio';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
