import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildEmbeddedImageFigure,
  collectCliInfographicFigures,
  compressPngToDataUri,
} from '../build.mjs';
import { generateCompressedImages } from '../generate-compressed-images.mjs';

const repoRoot = new URL('../', import.meta.url);
const sampleOriginal = new URL('../assets/diagrams/original/2026-08-28__chrome-speed-records__infographic.png', import.meta.url);

test('generateCompressedImages creates PNG outputs and a manifest without overwriting originals', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'technews-image-pipeline-'));
  const rootUrl = pathToFileURL(`${workspace}\\`);
  const originalDir = path.join(workspace, 'assets', 'diagrams', 'original');
  const compressedDir = path.join(workspace, 'assets', 'diagrams', 'compressed');
  const sampleName = '2026-08-28__chrome-speed-records__infographic.png';
  const copiedOriginal = path.join(originalDir, sampleName);

  await mkdir(originalDir, { recursive: true });
  await cp(sampleOriginal, copiedOriginal);

  const manifest = await generateCompressedImages({ rootUrl });
  const [originalInfo, compressedInfo, compressedBytes] = await Promise.all([
    stat(copiedOriginal),
    stat(path.join(compressedDir, sampleName)),
    readFile(path.join(compressedDir, sampleName)),
  ]);

  assert.equal(manifest.images.length, 1);
  assert.equal(manifest.images[0].name, sampleName);
  assert.equal(manifest.images[0].originalSize, originalInfo.size);
  assert.equal(manifest.images[0].compressedSize, compressedInfo.size);
  assert.equal(manifest.images[0].compressedPath, `assets/diagrams/compressed/${sampleName}`);
  assert.equal(manifest.images[0].originalPath, `assets/diagrams/original/${sampleName}`);
  assert.equal(manifest.images[0].verified, true);
  assert.match(manifest.images[0].compressedSha256, /^[a-f0-9]{64}$/);
  assert.equal(compressedBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(compressedInfo.size < originalInfo.size, true);

  const secondManifest = await generateCompressedImages({ rootUrl });
  assert.equal(secondManifest.images[0].compressedSha256, manifest.images[0].compressedSha256);
  assert.equal(secondManifest.generatedAt, manifest.generatedAt);
  assert.equal(secondManifest.images[0].generatedAt, manifest.images[0].generatedAt);

  const manifestPath = path.join(compressedDir, 'manifest.json');
  const manifestText = await readFile(manifestPath, 'utf8');
  await generateCompressedImages({ rootUrl });
  assert.equal(await readFile(manifestPath, 'utf8'), manifestText);

  await rm(workspace, { recursive: true, force: true });
});

test('compressPngToDataUri emits PNG data URIs with bounded width metadata', async () => {
  const result = await compressPngToDataUri(sampleOriginal);

  assert.equal(result.mimeType, 'image/png');
  assert.match(result.dataUri, /^data:image\/png;base64,/);
  assert.equal(result.width <= 1600, true);
  assert.equal(result.originalWidth, 2752);
  assert.equal(result.originalHeight, 1536);
});

test('buildEmbeddedImageFigure emits generated infographic markup backed by a PNG data URI', async () => {
  const figure = await buildEmbeddedImageFigure({
    alt: 'テスト用の図解',
    imageUrl: sampleOriginal,
  });

  assert.match(figure, /class="diagram article-diagram generated-infographic"/);
  assert.match(figure, /src="data:image\/png;base64,/);
  assert.match(figure, /alt="テスト用の図解"/);
});

test('collectCliInfographicFigures fails when a compressed PNG is missing for a known diagram', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'technews-build-missing-'));
  const rootUrl = new URL(`file:///${workspace.replace(/\\/g, '/')}/`);

  await assert.rejects(
    collectCliInfographicFigures({
      rootUrl,
      diagramAltText: { 'chrome-speed-records': 'テスト図解' },
    }),
    /missing compressed infographic PNG/i,
  );

  await rm(workspace, { recursive: true, force: true });
});
