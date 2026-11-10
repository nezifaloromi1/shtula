import { XMLParser } from 'fast-xml-parser';
import type { QuranAudio } from '../models/QuranAudio';
import feedConfig from '../config/feed.json';
import { fetchFeedXml } from './feedRequest';

/** These exact public URLs are copied from Flutter's lib/core/environment.dart defaults. */
export const FEATURED_QURAN_FEED_URL = feedConfig.feedUrl;
export const FEATURED_QURAN_ARTWORK_URL = feedConfig.artworkUrl;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  removeNSPrefix: false,
  isArray: (name) => ['item', 'enclosure', 'transcript', 'source'].includes(name),
});

type XmlRecord = Record<string, unknown>;

function asRecord(value: unknown): XmlRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as XmlRecord : null;
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function text(value: unknown): string {
  const item = first(value);
  if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
  const record = asRecord(item);
  if (!record) return '';
  return text(record['#text'] ?? record['#cdata-section'] ?? '');
}

function attr(value: unknown, name: string): string {
  const record = asRecord(first(value));
  const raw = record?.[`@_${name}`];
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
}

export function featuredQuranAudioId(guid: string, enclosure: string): string {
  const value = guid || enclosure;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `quran-feed-${(hash >>> 0).toString(16)}`;
}

function safeUrl(value: string, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const resolved = new URL(value, baseUrl);
    // Audio and metadata are fetched directly by the native network stack. Do not
    // silently downgrade a feed item to clear-text HTTP.
    if (resolved.protocol !== 'https:') return null;
    return normalizeGoogleDriveUrl(resolved.toString());
  } catch {
    return null;
  }
}

function normalizeGoogleDriveUrl(value: string): string {
  const url = new URL(value);
  if (!/(^|\.)drive\.google\.com$/i.test(url.hostname)) return url.toString();
  const pathId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
  const id = url.searchParams.get('id') || pathId;
  if (!id) return url.toString();

  if (url.pathname.includes('/thumbnail')) {
    const thumbnail = new URL('https://drive.google.com/thumbnail');
    thumbnail.searchParams.set('id', id);
    thumbnail.searchParams.set('sz', url.searchParams.get('sz') || 'w1200');
    const resourceKey = url.searchParams.get('resourcekey');
    if (resourceKey) thumbnail.searchParams.set('resourcekey', resourceKey);
    return thumbnail.toString();
  }

  // Google Drive now serves raw uploaded-file bytes from drive.usercontent.google.com.
  // Preserve resourcekey when the owner has enabled link-key based sharing.
  const download = new URL('https://drive.usercontent.google.com/download');
  download.searchParams.set('id', id);
  download.searchParams.set('export', 'download');
  download.searchParams.set('confirm', 't');
  download.searchParams.set('authuser', url.searchParams.get('authuser') || '0');
  const resourceKey = url.searchParams.get('resourcekey');
  if (resourceKey) download.searchParams.set('resourcekey', resourceKey);
  return download.toString();
}

function durationMs(value: unknown): number {
  const raw = text(value);
  if (!raw) return 0;
  const parts = raw.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  const seconds = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts.length === 2
      ? parts[0] * 60 + parts[1]
      : parts[0];
  return Math.round(seconds * 1000);
}

function safeFileName(title: string, url: string): string {
  let extension = 'mp3';
  try {
    const candidate = new URL(url).pathname.split('/').pop()?.split('.').pop()?.toLowerCase();
    if (candidate && /^[a-z0-9]{2,5}$/.test(candidate)) extension = candidate;
  } catch { /* Use the common audio extension. */ }
  const base = title.normalize('NFKD').replace(/[^\p{L}\p{N}._ -]/gu, '').replace(/[. ]+$/g, '').trim().slice(0, 90);
  return `${base || 'quran-audio'}.${extension}`;
}

function parsePublishedAt(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectItems(channel: XmlRecord): XmlRecord[] {
  const value = channel.item;
  return (Array.isArray(value) ? value : value ? [value] : []).map(asRecord).filter((item): item is XmlRecord => item !== null);
}

function enclosureUrl(item: XmlRecord, baseUrl: string): { url: string; mimeType: string | null; sizeBytes: number } | null {
  const candidates: unknown[] = [];
  if (item.enclosure) candidates.push(...(Array.isArray(item.enclosure) ? item.enclosure : [item.enclosure]));
  const mediaContent = item['media:content'];
  if (mediaContent) candidates.push(...(Array.isArray(mediaContent) ? mediaContent : [mediaContent]));
  for (const candidate of candidates) {
    const raw = attr(candidate, 'url');
    const type = attr(candidate, 'type').toLowerCase();
    const url = safeUrl(raw, baseUrl);
    if (!url) continue;
    const looksLikeAudio = type.startsWith('audio/') || /\.(mp3|m4a|m4b|aac|wav|flac|ogg|opus)(?:$|\?)/i.test(url);
    if (!looksLikeAudio && type && type !== 'application/octet-stream') continue;
    const length = Number(attr(candidate, 'length'));
    return { url, mimeType: type || null, sizeBytes: Number.isFinite(length) && length > 0 ? length : 0 };
  }
  return null;
}

function optionalMetadataUrl(item: XmlRecord, key: string, baseUrl: string): string | null {
  const raw = attr(item[key], 'url');
  return safeUrl(raw, baseUrl);
}

function parseItem(item: XmlRecord, baseUrl: string): QuranAudio | null {
  const enclosure = enclosureUrl(item, baseUrl);
  if (!enclosure) return null;
  const title = text(item.title);
  if (!title) return null;
  const guid = text(item.guid) || enclosure.url;
  const description = text(item['content:encoded']) || text(item.description) || null;
  const publishedAt = parsePublishedAt(item.pubDate ?? item['dc:date']);
  const image = attr(item['itunes:image'], 'href') || attr(item['media:thumbnail'], 'url');
  const imageUrl = safeUrl(image, baseUrl) || FEATURED_QURAN_ARTWORK_URL;
  return {
    id: featuredQuranAudioId(guid, enclosure.url),
    sourceType: 'featured-google-drive',
    sourceGuid: guid,
    title,
    artist: feedConfig.artist,
    uri: enclosure.url,
    localUri: null,
    fileName: safeFileName(title, enclosure.url),
    mimeType: enclosure.mimeType,
    sizeBytes: enclosure.sizeBytes,
    durationMs: durationMs(item['itunes:duration'] ?? item.duration),
    lastPositionMs: 0,
    isPlayed: false,
    addedAt: publishedAt ?? Date.now(),
    description,
    imageUrl,
    publishedAt,
    chaptersUrl: optionalMetadataUrl(item, 'podcast:chapters', baseUrl),
    transcriptUrl: optionalMetadataUrl(item, 'podcast:transcript', baseUrl),
    chapters: [],
  };
}

export async function loadFeaturedQuranFeed(signal?: AbortSignal): Promise<QuranAudio[]> {
  const { response, xml } = await fetchFeedXml(FEATURED_QURAN_FEED_URL, signal);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!xml.trim() || /^\s*(?:<!doctype\s+html|<html)/i.test(xml) || contentType.includes('text/html')) {
    throw new Error('Google Drive returned a web page instead of the configured RSS feed. Check that the feed file is shared for public reading.');
  }
  const document = asRecord(parser.parse(xml));
  const rss = asRecord(document?.rss);
  const channel = asRecord(rss?.channel);
  if (!channel) throw new Error('The configured Google Drive file did not contain an RSS channel.');
  const tracks = collectItems(channel).map((item) => parseItem(item, FEATURED_QURAN_FEED_URL)).filter((item): item is QuranAudio => item !== null);
  if (!tracks.length) throw new Error('The Quran audio feed contained no playable audio enclosures.');
  return tracks.sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
}
