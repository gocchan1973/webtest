import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const skillDir = new URL('../skills/auth-deploy/', import.meta.url);
const skill = fs.readFileSync(new URL('SKILL.md', skillDir), 'utf8');
const ui = fs.readFileSync(new URL('agents/openai.yaml', skillDir), 'utf8');

test('認証デプロイ skill has discoverable Japanese trigger and scope', () => {
  assert.match(skill, /^---\nname: auth-deploy\ndescription: Use when /);
  assert.match(skill, /認証デプロイ/);
  assert.match(skill, /Firebase/);
  assert.match(skill, /Cloudflare Worker/);
});

test('認証デプロイ skill preserves auth and deployment safety gates', () => {
  for (const phrase of [
    'FIREBASE_API_KEY',
    'FIREBASE_ALLOWED_UIDS',
    'run_worker_first',
    '.assetsignore',
    '401',
    'Googleログイン',
    '本番',
    '明示的な承認',
    'HttpOnly',
  ]) {
    assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('skill UI metadata uses the requested shorthand', () => {
  assert.match(ui, /display_name: "認証デプロイ"/);
  assert.match(ui, /allow_implicit_invocation: true/);
});
