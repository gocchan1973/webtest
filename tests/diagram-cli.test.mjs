import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutputName, buildPrompt, buildStyle, shouldGenerate } from '../generate-diagram.mjs';

test('diagram CLI derives stable output names from article IDs', () => {
  assert.equal(buildOutputName('search-ai-controls', '2026-08-27'), '2026-08-27__search-ai-controls__infographic.png');
});

test('diagram CLI prompt preserves Nano Banana 2 and standalone output requirements', () => {
  const prompt = buildPrompt({
    articleId: 'search-ai-controls',
    title: '出典の鎖',
    summary: '発見情報を公式一次情報へ再照合し、追跡可能なHTMLへ残す。'
  });
  assert.match(prompt, /Nano Banana 2/);
  assert.match(prompt, /日本語/);
  assert.match(prompt, /PNG/);
  assert.match(prompt, /search-ai-controls/);
  assert.match(prompt, /Visual style: editorial/);
});

test('diagram CLI skips existing assets unless forced', () => {
  assert.equal(shouldGenerate(true, false), false);
  assert.equal(shouldGenerate(true, true), true);
  assert.equal(shouldGenerate(false, false), true);
});

test('diagram CLI selects a visual style from article meaning', () => {
  assert.equal(buildStyle('sheets-formula-repair'), 'instructional');
  assert.equal(buildStyle('copilot-byok'), 'professional');
  assert.equal(buildStyle('npm-staged-controls'), 'scientific');
  assert.equal(buildStyle('workspace-may-drops'), 'bento-grid');
  assert.equal(buildStyle('chrome-speed-records'), 'scientific');
  assert.equal(buildStyle('gemini-classroom-boundary'), 'professional');
  assert.equal(buildStyle('unknown-article'), 'auto');
});

test('diagram CLI carries article-specific meaning into a new unvisualized article request', () => {
  const prompt = buildPrompt({
    articleId: 'workspace-studio-layered-protection',
    title: 'Workspace Studioの多層保護',
    summary: 'フローごとの権限、監査、停止経路を分離する。',
    style: buildStyle('workspace-studio-layered-protection')
  });
  assert.match(prompt, /workspace-studio-layered-protection/);
  assert.match(prompt, /Workspace Studioの多層保護/);
  assert.match(prompt, /Visual style: professional/);
});
