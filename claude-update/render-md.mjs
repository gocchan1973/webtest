// セッションへ注入される派生物。正本は facts.json。
//
// 注入は「出典と適用条件を伴う参照資料」であって運用指示ではない。
// 特定構成のセキュリティ報告を一般的な禁止事項へ変換させないため、
// scope を必ず fact と同じ塊に並べる。
export function renderMarkdown({ facts, generated = new Date().toISOString().slice(0, 10) }) {
  const active = facts.filter((f) => f.status === 'active');
  const lines = [
    '# Claude 自身の更新（自動注入）',
    '',
    `生成: ${generated} ／ 有効な事実: ${active.length} 件 ／ 正本: claude-update/facts.json`,
    '',
    'これは新機能カタログではない。**Claude の振る舞いが変わる事実**だけを載せる。',
    '各項目は適用条件つきの参照資料であって、無条件の運用指示ではない。',
    '条件の外へ一般化しないこと。',
    '',
  ];

  if (!active.length) {
    lines.push('**有効な事実は 0 件。** 収集はしているが、まだ採用した事実が無い。', '');
    return lines.join('\n');
  }

  for (const fact of active) {
    lines.push(`## ${fact.fact}`, '');
    lines.push(`- **こう振る舞う**: ${fact.behavior}`);
    lines.push(`- **適用条件**: ${fact.scope}`);
    lines.push(`- **確認**: ${fact.verified} ／ [公式一次情報](${fact.source})`);
    lines.push(`- **id**: \`${fact.id}\``);
    lines.push('');
  }

  return lines.join('\n');
}
