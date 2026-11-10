import type { QuranAudio } from '../models/QuranAudio';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    }
  }
  return bytes;
}

/** Encodes UTF-8 exactly like Dart's base64UrlEncode, without trailing padding. */
export function encodeBase64Url(value: string): string {
  const bytes = utf8Bytes(value);
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64[first >> 2];
    output += BASE64[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) output += BASE64[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) output += BASE64[third & 0x3f];
  }
  return output.replace(/\+/g, '-').replace(/\//g, '_');
}

export function buildEpisodeShareMessage(track: QuranAudio): string {
  if (!track.sourceGuid) return track.title;
  const podcastId = encodeBase64Url('sheikh-aadam-tuulaa');
  const episodeId = encodeBase64Url(track.sourceGuid);
  return `${track.title}\n\nhttps://pod.link/${podcastId}/episode/${episodeId}`;
}

/** Builds the same pod.link collection URL as the original Flutter share action. */
export function buildCollectionShareMessage(title: string, feedUrl: string): string {
  const safeTitle = title.trim();
  const safeFeedUrl = feedUrl.trim();
  if (!safeTitle || !safeFeedUrl) return safeTitle || safeFeedUrl;
  return `${safeTitle}\n\nhttps://pod.link/${encodeBase64Url(safeFeedUrl)}`;
}
