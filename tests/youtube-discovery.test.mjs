import assert from 'node:assert/strict';
import test from 'node:test';
import { youtubeChannels } from '../youtube-channels.mjs';
import { collectYouTubeCandidates } from '../youtube-rss.mjs';

test('YouTube channel registry keeps the 19 approved discovery sources', () => {
  assert.equal(youtubeChannels.length, 19);
  assert.equal(youtubeChannels[0].handle, 'ai_masaou');
  assert.equal(youtubeChannels.at(-1).handle, 'ai.seitai');
});

test('collectYouTubeCandidates keeps only target-week RSS entries and reports feed failures', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('@broken')) return { ok: false, status: 503, text: async () => '' };
    if (url.includes('@demo')) return { ok: true, status: 200, text: async () => '<script>"channelId":"UC_DEMO"</script>' };
    if (url.includes('UC_DEMO')) return { ok: true, status: 200, text: async () => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>yt:video:inside</id><published>2026-08-27T03:00:00+00:00</published><title>対象内</title><author><name>Demo</name></author></entry><entry><id>yt:video:outside</id><published>2026-08-31T03:00:00+00:00</published><title>対象外</title><author><name>Demo</name></author></entry></feed>` };
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await collectYouTubeCandidates({
    channels: [{ handle: 'demo', label: 'Demo' }, { handle: 'broken', label: 'Broken' }],
    start: '2026-08-24',
    end: '2026-08-30',
    fetchImpl,
  });

  assert.deepEqual(result.candidates, [{ channel: 'Demo', videoId: 'inside', published: '2026-08-27', title: '対象内', url: 'https://www.youtube.com/watch?v=inside' }]);
  assert.deepEqual(result.failures, [{ channel: 'Broken', stage: 'channel', status: 503 }]);
  assert.equal(calls.length, 3);
});

test('collectYouTubeCandidates accepts YouTube browseId as the channel identifier', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('@demo')) return { ok: true, status: 200, text: async () => '<script>"browseId":"UC_BROWSE"</script>' };
    if (url.includes('UC_BROWSE')) return { ok: true, status: 200, text: async () => '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>yt:video:browse</id><published>2026-08-28T03:00:00+00:00</published><title>browseId経由</title></entry></feed>' };
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await collectYouTubeCandidates({ channels: [{ handle: 'demo', label: 'Demo' }], start: '2026-08-24', end: '2026-08-30', fetchImpl });

  assert.equal(result.candidates[0]?.videoId, 'browse');
  assert.deepEqual(result.failures, []);
});

test('youtube channel registry marks only ATI for claude-update watching', () => {
  const watched = youtubeChannels.filter((c) => c.toolWatch);
  assert.equal(watched.length, 1);
  assert.equal(watched[0].handle, 'tech_news_ati');
  assert.equal(watched[0].label, 'テックニュース@ATI');
});

test('youtube channel registry keeps every other channel unwatched', () => {
  const others = youtubeChannels.filter((c) => c.handle !== 'tech_news_ati');
  assert.equal(others.length, 18);
  assert.ok(others.every((c) => c.toolWatch === undefined));
});

test('writeDiscovery writes parseable JSON itself so the file never passes through an agent patch', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { writeDiscovery } = await import('../youtube-discovery.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'discovery-'));
  try {
    const out = join(dir, 'nested', '2026-09-27.json');
    const result = { candidates: [{ channel: 'Demo', videoId: 'x', published: '2026-09-27', title: 'タイトル', url: 'https://www.youtube.com/watch?v=x' }], failures: [] };
    const summary = await writeDiscovery(result, out);
    const text = await readFile(out, 'utf8');
    assert.ok(text.startsWith('{'), 'file must start with the JSON object, not a patch marker');
    assert.deepEqual(JSON.parse(text), result);
    assert.deepEqual(summary, { path: out, candidates: 1, failures: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
