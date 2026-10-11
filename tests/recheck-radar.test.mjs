import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { recheckItem, recheckRadar, recheckSectionLabel, validateRecheck } from '../build.mjs';

const sample = {
  status: '判断更新',
  title: 'サンプルの判断、を再判定',
  fields: [
    ['以前の判断', '前はこうしていた。'],
    ['現在の再判定', '今はこうする。'],
  ],
  links: [
    ['公式一次情報', 'https://example.com/official'],
    ['発見元YouTube：サンプルch', 'https://example.com/video'],
  ],
};

test('再判定項目はデータからHTMLへ組み立てられる', () => {
  const html = recheckItem(sample);

  assert.match(html, /<span class="recheck-status">判断更新<\/span>/);
  assert.match(html, /<h3>サンプルの判断、を再判定<\/h3>/);
  assert.match(html, /<p><strong>以前の判断：<\/strong>前はこうしていた。<\/p>/);
  assert.equal((html.match(/<p><strong>/g) ?? []).length, 2);
});

test('出典は公式一次情報と発見元YouTubeでリンク種別が分かれる', () => {
  const html = recheckItem(sample);

  assert.match(html, /<a class="source-link" href="https:\/\/example\.com\/official"[^>]*>公式一次情報 →<\/a>/);
  assert.match(html, /<a class="discovery-link" href="https:\/\/example\.com\/video"[^>]*>発見元YouTube：サンプルch →<\/a>/);
});

test('該当がなかった週は「確認して該当なし」として枠が出る', () => {
  const html = recheckRadar([]);

  assert.match(html, /class="recheck-radar"/);
  assert.match(html, /class="recheck-none" data-recheck="confirmed-none"/);
  assert.match(html, /公式一次情報は確認済み/);
  assert.equal((html.match(/class="recheck-item"/g) ?? []).length, 0);
  assert.equal((html.match(/class="recheck-grid"/g) ?? []).length, 0);
});

test('該当があった週は項目が並び、空表示は出ない', () => {
  const html = recheckRadar([sample, sample]);

  assert.match(html, /class="recheck-grid"/);
  assert.equal((html.match(/class="recheck-item"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /class="recheck-none"/);
});

test('確認していない週は、該当なしの週と出力で区別できる', async () => {
  const confirmedNone = recheckRadar([]);
  const unverified = await readFile(new URL('../2026-08-23.html', import.meta.url), 'utf8');

  // 「確認して該当なし」は枠が出る。未確認の号はそもそも枠を持たない。
  assert.match(confirmedNone, /class="recheck-radar"/);
  assert.doesNotMatch(unverified, /class="recheck-radar"/);
});

test('出典の無い再判定は受け付けない', () => {
  assert.throws(
    () => validateRecheck([{ status: '判断更新', title: 'タイトル', fields: [['以前の判断', '…']], links: [] }], 'x.json'),
    /links が空です/,
  );
});

test('fields の形式違反は build を止める', () => {
  assert.throws(
    () => validateRecheck([{ status: '判断更新', title: 'タイトル', fields: ['ラベルだけ'], links: [['出典', 'https://example.com']] }], 'x.json'),
    /\[ラベル, 値\] の組/,
  );
});

test('sourceId は sources.mjs の URL へ解決され、無ければ止まる', () => {
  const base = { status: '判断更新', title: 'タイトル', fields: [['以前の判断', '…']] };

  const [resolved] = validateRecheck(
    [{ ...base, links: [['Anthropic Newsroom', { sourceId: 'anthropic-newsroom' }]] }], 'x.json');
  assert.equal(resolved.links[0][1], 'https://www.anthropic.com/news');

  assert.throws(
    () => validateRecheck([{ ...base, links: [['どこか', { sourceId: 'no-such-source' }]] }], 'x.json'),
    /sources\.mjs に無い sourceId/,
  );
});

test('該当なしの週は空配列として受け付ける', () => {
  assert.deepEqual(validateRecheck([], '2026-08-23.json'), []);
});

// ---- v2: ハーネス改善提案（2026-09-27 号以降） ----
const v2Labels = ['現状のハーネス', '公式の変更', '提案', '期待する改善', '確認方法'];
const v2Sample = {
  status: '改善提案',
  title: 'フックの既定値変更に追従する',
  harness: ['~/.claude/settings.json', '~/.claude/hooks/rule_reminders.py'],
  fields: v2Labels.map((label) => [label, `${label}の内容`]),
  links: [['公式一次情報', 'https://example.com/official']],
};

test('v2: 正しい形式は通り、harness が結果に残る', () => {
  const [item] = validateRecheck([v2Sample], '2026-09-27.json');
  assert.deepEqual(item.harness, v2Sample.harness);
});

test('v2: フィールドのラベル違反は throw する', () => {
  const wrongOrder = { ...v2Sample, fields: [...v2Sample.fields].reverse() };
  const missing = { ...v2Sample, fields: v2Sample.fields.slice(0, 4) };
  const legacy = { ...v2Sample, fields: [['以前の判断', '…'], ['現在の再判定', '…']] };
  for (const bad of [wrongOrder, missing, legacy]) {
    assert.throws(() => validateRecheck([bad], '2026-09-27.json'), /fields のラベルは順に/);
  }
});

test('v2: harness の欠落・空・非文字列は throw する', () => {
  for (const harness of [undefined, [], [''], [1]]) {
    assert.throws(() => validateRecheck([{ ...v2Sample, harness }], '2026-09-27.json'), /harness は空でない文字列の配列/);
  }
});

test('v2: status は3種に限定される', () => {
  for (const status of ['改善提案', '回避策の撤去', '追従が必要']) {
    assert.equal(validateRecheck([{ ...v2Sample, status }], '2026-09-27.json').length, 1);
  }
  assert.throws(() => validateRecheck([{ ...v2Sample, status: '判断更新' }], '2026-09-27.json'), /status は/);
});

test('v2: links 必須は従来どおり', () => {
  assert.throws(() => validateRecheck([{ ...v2Sample, links: [] }], '2026-09-27.json'), /links が空です/);
});

test('v1 号(2026-09-20 以前)は緩い検証のまま、harness も付かない', () => {
  const [item] = validateRecheck([sample], '2026-09-20.json');
  assert.equal(item.harness, undefined);
  assert.equal(item.status, '判断更新');
});

test('v2: 見出し・対象行・導入文が出る', () => {
  const html = recheckRadar([v2Sample], '2026-09-27');
  assert.match(html, /<h2 id="ai-recheck-title">ハーネス改善提案<\/h2>/);
  assert.match(html, /data-article-id="ai-self-update-recheck"/);
  assert.match(html, /裏取り付きで提案する独立枠/);
  assert.match(html, /<p class="recheck-harness"><strong>対象：<\/strong><code>~\/\.claude\/settings\.json<\/code>, <code>~\/\.claude\/hooks\/rule_reminders\.py<\/code><\/p>/);
  assert.ok(html.indexOf('<h3>') < html.indexOf('recheck-harness'));
  assert.doesNotMatch(html, /再判定レーダー/);
  assert.match(html, /「今週、ハーネスに効く更新なし」と記録する/);
});

test('v2: 空の週は「ハーネスに効く更新なし」で confirmed-none を維持する', () => {
  const html = recheckRadar([], '2026-09-27');
  assert.match(html, /class="recheck-none" data-recheck="confirmed-none">今週、ハーネスに効く更新なし。公式一次情報は確認済みで、該当が無かったことを記録する。/);
});

test('v1 号の表示は従来の文言のまま', () => {
  for (const html of [recheckRadar([], '2026-09-20'), recheckRadar([])]) {
    assert.match(html, /AI自己更新・再判定レーダー/);
    assert.match(html, /今週、判断を変える更新なし。公式一次情報は確認済み/);
    assert.doesNotMatch(html, /ハーネス改善提案|recheck-harness/);
  }
});

test('recheckSectionLabel names the section by issue format, shared by page heading and knowledge listing', () => {
  assert.equal(recheckSectionLabel('2026-09-20'), 'AI自己更新・再判定レーダー');
  assert.equal(recheckSectionLabel('2026-09-27'), 'ハーネス改善提案');
  assert.match(recheckRadar([], '2026-09-27'), new RegExp(`<h2 id="ai-recheck-title">${recheckSectionLabel('2026-09-27')}</h2>`));
});
