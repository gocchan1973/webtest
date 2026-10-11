import { youtubeChannels } from './youtube-channels.mjs';

const strip = (value) => value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const tag = (entry, name) => strip(entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1] ?? '');

function parseFeed(xml, channel, start, end) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap((match) => {
    const entry = match[1];
    const published = tag(entry, 'published').slice(0, 10);
    if (published < start || published > end) return [];
    const videoId = tag(entry, 'id').replace(/^yt:video:/, '');
    const title = tag(entry, 'title');
    return videoId && title ? [{ channel, videoId, published, title, url: `https://www.youtube.com/watch?v=${videoId}` }] : [];
  });
}

export async function collectYouTubeCandidates({ channels = youtubeChannels, start, end, fetchImpl = fetch }) {
  const outcomes = await Promise.all(channels.map(async ({ handle, label }) => {
    const channelResponse = await fetchImpl(`https://www.youtube.com/@${encodeURIComponent(handle)}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (!channelResponse?.ok) return { failures: [{ channel: label, stage: 'channel', status: channelResponse?.status ?? 'network' }] };
    const channelId = (await channelResponse.text()).match(/"(?:channelId|browseId)":"(UC[\w-]+)"/)?.[1];
    if (!channelId) return { failures: [{ channel: label, stage: 'channel-id', status: 'missing' }] };
    const feedResponse = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (!feedResponse?.ok) return { failures: [{ channel: label, stage: 'rss', status: feedResponse?.status ?? 'network' }] };
    return { candidates: parseFeed(await feedResponse.text(), label, start, end) };
  }));
  return { candidates: outcomes.flatMap((item) => item.candidates ?? []), failures: outcomes.flatMap((item) => item.failures ?? []) };
}
