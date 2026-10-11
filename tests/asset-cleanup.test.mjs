import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';

const htmlPath = new URL('../asset-cleanup.html', import.meta.url);
const originalPath = new URL('../assets/diagrams/original/', import.meta.url);
const compressedPath = new URL('../assets/diagrams/compressed/', import.meta.url);
const manifestPath = new URL('../assets/diagrams/compressed/manifest.json', import.meta.url);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getExpectedAssets() {
  const names = (await readdir(originalPath)).filter((name) => name.endsWith('.png')).sort();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return Promise.all(names.map(async (name) => {
    const originalUrl = new URL(name, originalPath);
    const compressedUrl = new URL(name, compressedPath);
    const [originalBytes, originalInfo, compressedInfo] = await Promise.all([
      readFile(originalUrl),
      stat(originalUrl),
      stat(compressedUrl),
    ]);
    const manifestEntry = manifest.images.find((entry) => entry.name === name);
    return {
      name,
      originalSize: originalInfo.size,
      originalSha256: createHash('sha256').update(originalBytes).digest('hex'),
      compressedSize: compressedInfo.size,
      manifestEntry,
    };
  }));
}

test('asset cleanup page is standalone and embeds the current original/compressed inventory', async () => {
  const html = await readFile(htmlPath, 'utf8');
  const expectedAssets = await getExpectedAssets();

  assert.match(html, /<!doctype html>/i);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link\b[^>]*rel=["']stylesheet["']/i);
  assert.match(html, /assets\/diagrams\/original 配下の原本PNG/);
  assert.match(html, /assets\/diagrams\/compressed/);
  assert.match(html, /id=["']asset-data["'][^>]*type=["']application\/json["']/i);

  for (const asset of expectedAssets) {
    assert.match(html, new RegExp(`"name":"${escapeRegExp(asset.name)}"`));
    assert.match(html, new RegExp(`"originalSize":${asset.originalSize}`));
    assert.match(html, new RegExp(`"originalSha256":"${asset.originalSha256}"`));
    assert.match(html, new RegExp(`"compressedSize":${asset.compressedSize}`));
  }
});

test('asset cleanup page marks only verified original assets with compressed counterparts as deletion candidates', async () => {
  const html = await readFile(htmlPath, 'utf8');
  const expectedAssets = await getExpectedAssets();

  assert.match(html, /候補/);
  assert.match(html, /保持/);
  assert.match(html, /検証済み/);

  for (const asset of expectedAssets) {
    assert.ok(asset.manifestEntry);
    assert.equal(asset.manifestEntry.verified, true);
    assert.match(html, new RegExp(`"name":"${escapeRegExp(asset.name)}"[\\s\\S]*?"status":"candidate"`));
    assert.match(html, new RegExp(`"name":"${escapeRegExp(asset.name)}"[\\s\\S]*?"verified":true`));
    assert.match(html, new RegExp(`"name":"${escapeRegExp(asset.name)}"[\\s\\S]*?"usageCount":[1-9]\\d*`));
  }
});

test('asset cleanup page exposes a two-step manifest workflow instead of deleting files', async () => {
  const html = await readFile(htmlPath, 'utf8');

  assert.match(html, /検証済み候補だけ選択できます/);
  assert.match(html, /確認状態へ進む/);
  assert.match(html, /削除対象JSONをダウンロード/);
  assert.match(html, /安全のため実ファイルは削除しません/);
  assert.match(html, /schemaVersion:\s*1/);
  assert.match(html, /deleteCandidates/);
  assert.match(html, /new Blob\s*\(/);
  assert.match(html, /URL\.createObjectURL/);
  assert.match(html, /asset-cleanup-manifest\.json/);
  assert.match(html, /window\.confirm/);
  assert.match(html, /input\.disabled = asset\.status !== 'candidate'/);
});

test('asset cleanup page includes original and compressed previews plus size comparison', async () => {
  const html = await readFile(htmlPath, 'utf8');
  const expectedAssets = await getExpectedAssets();

  assert.match(html, /<th>プレビュー<\/th>/);
  assert.match(html, /compressed/);
  assert.match(html, /削減率/);
  assert.match(html, /data-label="プレビュー"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /preview-asset-name/);
  assert.match(html, /thumbnail-link/);
  assert.match(html, /thumbnail-image/);
  assert.match(html, /assetPreviewPath/);

  for (const asset of expectedAssets) {
    assert.match(
      html,
      new RegExp(`"name":"${escapeRegExp(asset.name)}"`)
    );
  }
});
