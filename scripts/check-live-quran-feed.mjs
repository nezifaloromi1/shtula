import { readFile } from 'node:fs/promises';

const configUrl = new URL('../src/features/quran/config/feed.json', import.meta.url);
const feedConfig = JSON.parse(await readFile(configUrl, 'utf8'));
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 25_000);

try {
  const response = await fetch(feedConfig.feedUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
      'User-Agent': 'Sheademtula/1.0.0 (Quran audio feed verifier)',
    },
    redirect: 'follow',
    signal: controller.signal,
  });

  if (!response.ok) {
    throw new Error(`Google Drive feed returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const xml = await response.text();
  if (!xml.trim() || /^(?:\s*<!doctype\s+html|\s*<html)/i.test(xml) || contentType.includes('text/html')) {
    throw new Error('Google Drive returned an HTML page, not the RSS feed. Verify that the original feed file is publicly readable.');
  }
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) {
    throw new Error('The configured Google Drive file does not contain an RSS 2.0 channel.');
  }

  const itemBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const audioItems = itemBlocks.filter((item) =>
    /<enclosure\b[^>]*\burl\s*=\s*["'][^"']+["'][^>]*>/i.test(item)
      || /<media:content\b[^>]*\burl\s*=\s*["'][^"']+["'][^>]*>/i.test(item),
  );
  if (audioItems.length === 0) {
    throw new Error(`RSS channel found (${itemBlocks.length} items), but no audio enclosures were found.`);
  }

  const title = xml.match(/<channel\b[^>]*>[\s\S]*?<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    ?.replace(/<[^>]+>/g, '')
    ?.trim() || 'Untitled channel';

  console.log('LIVE GOOGLE DRIVE FEED VERIFIED');
  console.log(`Channel: ${title}`);
  console.log(`RSS items: ${itemBlocks.length}`);
  console.log(`Items with audio enclosures: ${audioItems.length}`);
  console.log(`Final response URL: ${response.url}`);
  console.log('No fixture or sample feed data was used by this check.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`LIVE FEED CHECK FAILED: ${message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
