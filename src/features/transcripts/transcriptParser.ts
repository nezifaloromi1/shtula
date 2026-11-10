export type TranscriptCue = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export function timeToSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts[0]) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite)) return null;
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

export function parseTranscriptText(raw: string): TranscriptCue[] {
  const matches = [...raw.matchAll(/((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g)];
  return matches.map((match) => {
    const startSeconds = timeToSeconds(match[1]);
    const endSeconds = timeToSeconds(match[2]);
    return startSeconds === null || endSeconds === null
      ? null
      : { startSeconds, endSeconds, text: match[3].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim() };
  }).filter((cue): cue is TranscriptCue => cue !== null && cue.text.length > 0);
}

export function parseTranscriptJson(payload: unknown): TranscriptCue[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const values = Array.isArray(payload)
    ? payload
    : Array.isArray(record.cues)
      ? record.cues
      : Array.isArray(record.transcript)
        ? record.transcript
        : [];
  return values.map((entry) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const startSeconds = timeToSeconds(item.startTime ?? item.start ?? item.start_time);
    const endSeconds = timeToSeconds(item.endTime ?? item.end ?? item.end_time);
    const text = typeof item.text === 'string' ? item.text.trim() : typeof item.content === 'string' ? item.content.trim() : '';
    return startSeconds === null || !text ? null : { startSeconds, endSeconds: endSeconds ?? startSeconds + 5, text };
  }).filter((cue): cue is TranscriptCue => cue !== null).sort((a, b) => a.startSeconds - b.startSeconds);
}

export function parseTranscriptContent(content: string, contentType = ''): { cues: TranscriptCue[]; plainText: string } {
  let cues: TranscriptCue[] = [];
  if (contentType.toLowerCase().includes('json') || /^[\s]*[\[{]/.test(content)) {
    try {
      cues = parseTranscriptJson(JSON.parse(content) as unknown);
    } catch {
      // Invalid JSON is allowed to fall through to VTT/SRT parsing.
    }
  }
  if (!cues.length) cues = parseTranscriptText(content);
  const plainText = cues.length
    ? ''
    : content.replace(/^WEBVTT[^\n]*\n/i, '').replace(/<[^>]+>/g, '').trim();
  return { cues, plainText };
}

export function formatTranscriptTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
