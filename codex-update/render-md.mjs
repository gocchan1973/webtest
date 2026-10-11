// セッションへ注入される派生物。正本は facts.json。
import { formatJapanDate } from './date.mjs';

const singleLine = (value) => String(value ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
const markdownUrl = (value) => singleLine(value).replace(/\)/g, '%29');

export function renderMarkdown({ facts, generated = formatJapanDate() }) {
  const active = facts.filter((f) => f.status === 'active');
  const lines = [
    '# Codex / OpenAI 自身の更新（自動注入）',
    '',
    `生成: ${generated} ／ 有効な事実: ${active.length} 件 ／ 正本: codex-update/facts.json`,
    '',
    'これは新機能カタログではない。**Codex / OpenAI の振る舞いが変わる事実**だけを載せる。',
    '各項目は適用条件つきの参照資料であって、無条件の運用指示ではない。',
    '条件の外へ一般化しないこと。',
    '',
  ];

  if (!active.length) {
    lines.push('**有効な事実は 0 件。** 収集はしているが、まだ採用した事実が無い。', '');
    return lines.join('\n');
  }

  for (const fact of active) {
    lines.push(`## ${singleLine(fact.fact)}`, '');
    lines.push(`- **こう振る舞う**: ${singleLine(fact.behavior)}`);
    lines.push(`- **適用条件**: ${singleLine(fact.scope)}`);
    lines.push(`- **確認**: ${singleLine(fact.verified)} ／ [公式一次情報](${markdownUrl(fact.source)})`);
    lines.push(`- **id**: \`${singleLine(fact.id)}\``, '');
  }
  return lines.join('\n');
}
