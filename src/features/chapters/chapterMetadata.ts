import type { QuranChapter } from '@/features/quran/models/QuranAudio';

function parseSeconds(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

export function parseChapters(payload: unknown): QuranChapter[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const items = Array.isArray(payload) ? payload : Array.isArray(record.chapters) ? record.chapters : [];
  return items.map((entry) => {
    const chapter = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const startSeconds = parseSeconds(chapter.startTime ?? chapter.start_time ?? chapter.start);
    if (startSeconds === null) return null;
    const title = typeof chapter.title === 'string' && chapter.title.trim() ? chapter.title.trim() : 'Untitled chapter';
    const endSeconds = parseSeconds(chapter.endTime ?? chapter.end_time ?? chapter.end);
    const imageUrl = typeof chapter.img === 'string' ? chapter.img : typeof chapter.image === 'string' ? chapter.image : typeof chapter.imageUrl === 'string' ? chapter.imageUrl : null;
    const url = typeof chapter.url === 'string' ? chapter.url : null;
    const toc = chapter.toc !== false && chapter.toc !== 'false';
    return { title, startSeconds, endSeconds, imageUrl, url, toc };
  }).filter((chapter): chapter is QuranChapter => chapter !== null).sort((left, right) => left.startSeconds - right.startSeconds);
}
