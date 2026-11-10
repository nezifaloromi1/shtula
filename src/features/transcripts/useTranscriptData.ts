import { useEffect, useState } from 'react';
import type { QuranAudio } from '@/features/quran/models/QuranAudio';
import { readCachedTranscript, writeCachedTranscript } from '@/storage/database';
import { parseTranscriptContent, type TranscriptCue } from './transcriptParser';

export function useTranscriptData(track: QuranAudio | null) {
  const [cues, setCues] = useState<TranscriptCue[]>([]);
  const [plainText, setPlainText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setCues([]);
    setPlainText('');
    setError(null);

    if (!track) {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(Boolean(track.transcriptUrl));
    void (async () => {
      let hasCachedTranscript = false;
      try {
        const cached = await readCachedTranscript(track.id);
        if (active && cached?.length) {
          hasCachedTranscript = true;
          setCues(cached.map((cue) => ({
            startSeconds: cue.startMs / 1000,
            endSeconds: cue.endMs / 1000,
            text: cue.text,
          })));
        }
      } catch (cacheError) {
        console.warn('Cached transcript could not be read.', cacheError);
      }

      if (!track.transcriptUrl) {
        if (active) setLoading(false);
        return;
      }

      try {
        const response = await fetch(track.transcriptUrl, {
          headers: { Accept: 'text/vtt, application/x-subrip, application/json, text/plain, */*' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Transcript metadata returned HTTP ${response.status}.`);
        const contentType = response.headers.get('content-type') ?? '';
        const content = await response.text();
        const parsed = parseTranscriptContent(content, contentType);
        if (!active) return;

        if (parsed.cues.length) {
          setCues(parsed.cues);
          setPlainText('');
          void writeCachedTranscript(track.id, parsed.cues.map((cue) => ({
            startMs: Math.round(cue.startSeconds * 1000),
            endMs: Math.round(cue.endSeconds * 1000),
            text: cue.text,
            speaker: '',
          }))).catch((cacheError) => console.warn('Transcript cache could not be saved.', cacheError));
        } else if (!hasCachedTranscript) {
          setPlainText(parsed.plainText);
        }
      } catch (reason) {
        if (active && !controller.signal.aborted && !hasCachedTranscript) {
          setError(reason instanceof Error ? reason.message : 'Could not load the transcript.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [track?.id, track?.transcriptUrl]);

  return { cues, plainText, loading, error };
}
