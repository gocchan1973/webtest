import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

test('diagramize skill supports Japanese activation and generic visualization inputs', async () => {
  const skill = await readFile(new URL('../skills/diagramize/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /^---[\s\S]*name:\s*diagramize/m);
  assert.match(skill, /description:\s*Use when/);
  assert.match(skill, /図解化/);
  assert.match(skill, /図解して/);
  assert.match(skill, /図解対象パッケージ/);
  assert.match(skill, /subject/);
  assert.match(skill, /visual_style|visualStyle/);
  assert.match(skill, /audience/);
  assert.match(skill, /NotebookLM/);
  assert.match(skill, /SVG/);
  assert.match(skill, /HTML/);
  for (const term of ['requested', 'queued', 'waiting-capacity', 'generating', 'retrieving', 'embedded', 'nextCheckAt', 'capacityObservedAt', 'capacitySource', 'sourceRevision', 'promptVersion', '5時間', 'バックグラウンド', 'HTML埋め込み']) {
    assert.match(skill, new RegExp(term));
  }
  assert.doesNotMatch(skill, /TBD|TODO|FIXME/);
});

test('diagramize skill files remain in sync across Claude, Antigravity, and Dev_hub', async () => {
  const normalize = (text) => text.replace(/\r\n/g, '\n').trim();

  const claudeSkill = await readFile(new URL('../skills/diagramize/SKILL.md', import.meta.url), 'utf8');
  const agySkill = await readFile(new URL('../.agents/skills/diagramize/SKILL.md', import.meta.url), 'utf8');

  // 1. プロジェクト内: Claude用(skills/)とAntigravity用(.agents/skills/)の完全一致を検証
  assert.equal(
    normalize(claudeSkill),
    normalize(agySkill),
    'skills/diagramize/SKILL.md and .agents/skills/diagramize/SKILL.md must be identical'
  );

  // 2. Dev_hub正本環境が存在する場合、正本との完全一致も検証
  // Dev_hub が無い環境（別マシン・CI・新規クローン）ではハブ一致を検証できない。
  // 黙って通すと「合格した」と「実行しなかった」が出力上で区別できなくなるため、
  // スキップしたことを必ず残す。recheck/<号>.json の [] が「確認して該当なし」と
  // 「未確認」を分けているのと同じ理由。
  const hubPath = 'F:/Dev_hub/skills/gemini/diagramize/SKILL.md';
  if (existsSync(hubPath)) {
    const hubSkill = await readFile(hubPath, 'utf8');
    assert.equal(
      normalize(agySkill),
      normalize(hubSkill),
      '.agents/skills/diagramize/SKILL.md and Dev_hub master (F:/Dev_hub/skills/gemini/diagramize/SKILL.md) must be identical'
    );
  } else {
    console.log(`[skip] Dev_hub 正本が見つからないため、ハブとの一致は未検証: ${hubPath}`);
  }
});
