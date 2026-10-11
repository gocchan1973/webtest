// 人が確認する独立ページ群。外部依存なしで file:// から開ける。
import { formatJapanDate } from './date.mjs';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeHref = (value) => {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? esc(url.href) : '#';
  } catch {
    return '#';
  }
};

const safeRelativeHref = (value) => {
  const text = String(value ?? '');
  const segment = '[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*';
  const pattern = new RegExp(`^(?:\\.\\./)?${segment}(?:/${segment})*$`);
  if (!pattern.test(text)) {
    return '#';
  }
  return esc(text);
};

const STALE_DAYS = 90;
const staleDays = (verified, generated) => {
  const from = Date.parse(verified);
  const to = Date.parse(generated);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / 86400000);
};
const DISPOSITION_LABEL = { accepted: '採用', rejected: '不採用', pending: '保留' };
const EFFECT_LABEL = { changed: '判断を変えた', confirmed: '判断が裏付けられた', rejected: '当てはまらないと退けた' };

const formatHitDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '').slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const STYLE = `
:root { color-scheme: light dark; --line: #d0d0d0; --muted: #666; --warn: #8a5a00; }
body { margin: 0 auto; padding: 2rem 1.25rem; max-width: 52rem; font: 15px/1.8 system-ui, sans-serif; }
h1 { font-size: 1.5rem; margin-bottom: .25rem; } h2 { font-size: 1.15rem; margin-top: 2.5rem; border-bottom: 2px solid var(--line); padding-bottom: .3rem; }
h3 { font-size: 1rem; margin: 1.5rem 0 .4rem; } h4 { font-size: .9rem; margin: .9rem 0 .2rem; }
.lead, .note { color: var(--muted); font-size: .9rem; } .caveat { border-left: 3px solid var(--warn); padding: .6rem .9rem; margin: 1rem 0; font-size: .9rem; }
.card { border: 1px solid var(--line); border-radius: 6px; padding: .9rem 1.1rem; margin: .9rem 0; } .card.gone h3 { text-decoration: line-through; opacity: .6; }
dl { margin: .4rem 0 0; display: grid; grid-template-columns: max-content 1fr; gap: .2rem .8rem; } dt { color: var(--muted); font-size: .85rem; }
dd { margin: 0; word-break: break-word; } .unused { color: var(--warn); font-size: .9rem; } .tag { display: inline-block; border: 1px solid var(--line); border-radius: 3px; padding: 0 .4rem; font-size: .8rem; margin-right: .4rem; }
ul { padding-left: 1.2rem; }
`;

function factCard(fact, hits, generated) {
  const mine = hits.filter((h) => h.item === fact.id);
  const used = mine.length
    ? `<ul>${mine.map((h) => `<li><span class="tag">${esc(EFFECT_LABEL[h.effect] ?? h.effect)}</span>${esc(formatHitDate(h.ts))} ／ ${esc(h.topic)}${h.note ? `<br>${esc(h.note)}` : ''}</li>`).join('')}</ul>`
    : '<p class="unused">参照記録なし（実際に使われていない証明ではない）</p>';
  const age = staleDays(fact.verified, generated);
  const stale = age !== null && age > STALE_DAYS ? ` <span class="unused">／ 未再確認 ${age} 日</span>` : '';
  const found = (fact.discoveredIn ?? []).map((d) => {
    const label = esc(d.title || d.issue);
    const link = d.videoId ? `<a href="${safeHref(`https://www.youtube.com/watch?v=${encodeURIComponent(d.videoId)}`)}">${label}</a>` : label;
    const meta = [d.channel && esc(d.channel), esc(d.issue)].filter(Boolean).join(' ／ ');
    return meta ? `${link}<br><span class="note">${meta}</span>` : link;
  }).join('<br>');
  return `<div class="card${fact.status === 'superseded' ? ' gone' : ''}">
<h3>${esc(fact.fact)}</h3><dl>
<dt>こう振る舞う</dt><dd>${esc(fact.behavior)}</dd><dt>適用条件</dt><dd>${esc(fact.scope)}</dd>
<dt>公式一次情報</dt><dd><a href="${safeHref(fact.source)}">${esc(fact.source)}</a>（確認 ${esc(fact.verified)}${stale}）</dd>
<dt>発見元</dt><dd>${found || '—'}</dd><dt>id</dt><dd><code>${esc(fact.id)}</code></dd>
${fact.supersededBy ? `<dt>後継</dt><dd><code>${esc(fact.supersededBy)}</code> に置き換わった</dd>` : ''}
</dl><h4>刺さった記録</h4>${used}</div>`;
}

const pageStart = (title, generated, backHref = '') => `<!DOCTYPE html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style>
<h1>${esc(title)}</h1>
<p class="lead">生成 ${esc(generated)}</p>
${backHref ? `<p class="note"><a href="${safeRelativeHref(backHref)}">一覧へ戻る</a></p>` : ''}`;

const pageEnd = '</html>';

const dispositionSummary = (entries) => {
  const counts = { accepted: 0, rejected: 0, pending: 0 };
  for (const entry of entries) {
    if (Object.hasOwn(counts, entry.disposition)) counts[entry.disposition] += 1;
  }
  return `採用 ${counts.accepted} ／ 不採用 ${counts.rejected} ／ 保留 ${counts.pending}`;
};

export function renderIndexHtml({ issues, facts, hits, generated = formatJapanDate() }) {
  const active = facts.filter((f) => f.status === 'active');
  const history = facts.filter((f) => f.status !== 'active');
  const sortedIssues = [...issues].sort((a, b) => String(b.issue).localeCompare(String(a.issue)));
  const issueLinks = sortedIssues.map(({ issue, entries }) => `<li><a href="${safeRelativeHref(`articles/${issue}.html`)}">${esc(issue)}</a>（印 ${entries.length} 件 ／ ${esc(dispositionSummary(entries))}）</li>`).join('');
  return `${pageStart('Codex / OpenAI 自身の更新', generated)}
<p class="lead">週次の技術レーダー本体とは別のサブ機能。載せるのは <strong>Codex / OpenAI の振る舞いが変わる事実</strong>だけで、新機能カタログではない。</p>
<h2>現在の記録</h2>
<ul><li><a href="articles/facts.html">採用した事実と履歴</a>（有効な事実 ${active.length} 件 ／ 履歴 ${history.length} 件 ／ 参照記録 ${hits.length} 件）</li></ul>
<h2>候補の号別記録</h2>
${issueLinks ? `<ul>${issueLinks}</ul>` : '<p class="note">まだ号がない。</p>'}
</html>`;
}

export function renderFactsHtml({ facts, hits, generated = formatJapanDate() }) {
  const active = facts.filter((f) => f.status === 'active');
  const gone = facts.filter((f) => f.status !== 'active');
  return `${pageStart('採用した事実と履歴', generated, '../index.html')}
<p class="lead">有効な事実 ${active.length} 件 ／ 参照記録 ${hits.length} 件</p>
<p class="note">「こう振る舞う」が書けない事実は採らない。適用条件（scope）を条件の外へ一般化しないこと。</p>
<h2>採用した事実</h2>
${active.map((f) => factCard(f, hits, generated)).join('') || '<p class="note">まだ採用した事実は無い。</p>'}
${gone.length ? `<h2>置き換わった事実</h2><p class="note">注入からは外れているが、履歴として残す。</p>${gone.map((f) => factCard(f, hits, generated)).join('')}` : ''}
<h2>この記録の読み方</h2><div class="caveat"><p><strong>「使った」という記録は弱い証拠。</strong>判定しているのが書いた本人（Codex）なので、自己申告の域を出ない。</p>
<p><strong>「参照 0 件」は、この記録に残った参照が無いことだけを示す。</strong>実際に読まれていない証明ではない。</p>
<p>狙いは実績を誇ることではなく、<strong>記録上の不使用を可視化すること</strong>にある。参照 0 件を隠さず出しつつ、実際の利用と混同しないための表示である。</p></div>
<p class="note">記録は同意を条件にしない。読んだうえで「今回は当てはまらない」と退けた回（${esc(EFFECT_LABEL.rejected)}）も残す。測っているのは参照されたかどうかであって、従ったかどうかではない。</p>
${pageEnd}`;
}

export function renderIssueHtml({ issue, entries, generated = formatJapanDate() }) {
  return `${pageStart(`候補の採否 ${issue}`, generated, '../index.html')}
<p class="lead">${esc(issue)} ／ 印 ${entries.length} 件 ／ ${esc(dispositionSummary(entries))}</p>
<p class="note">印が付いた候補の全件。外したものも理由つきで残す。「見て外した」と「まだ見ていない」を混ぜないため。</p>
${entries.length ? entries.map((entry) => `<div class="card"><h2><a href="${safeHref(entry.url)}">${esc(entry.title)}</a></h2><dl>
<dt>採否</dt><dd>${esc(DISPOSITION_LABEL[entry.disposition] ?? entry.disposition)}</dd><dt>理由</dt><dd>${esc(entry.reason)}</dd>
<dt>出た事実</dt><dd>${(entry.facts ?? []).length ? entry.facts.map((f) => `<code>${esc(f)}</code>`).join(', ') : '—'}</dd>
</dl></div>`).join('') : '<p class="note">印の付いた候補なし。</p>'}
${pageEnd}`;
}
