export type FeedRequestResult = {
  response: Response;
  xml: string;
};

/** Fetch an RSS response with one deadline covering both headers and the body. */
export async function fetchFeedXml(
  feedUrl: string,
  signal?: AbortSignal,
  timeoutMs = 25_000,
): Promise<FeedRequestResult> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  const timeout = setTimeout(() => controller.abort(new Error('Quran feed request timed out.')), timeoutMs);
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (signal?.aborted) abortFromCaller();

  try {
    const response = await fetch(feedUrl, {
      method: 'GET',
      headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The Quran audio feed returned HTTP ${response.status}.`);
    const xml = await response.text();
    return { response, xml };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The Quran audio feed request timed out or was cancelled.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
