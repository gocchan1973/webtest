// 人が確認する1枚。正本は issues/<号>.json / facts.json / hits.jsonl。
// 外部依存なしで file:// から開けること（既存の号 HTML と同じ条件）。
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// verified からこの日数を超えたら「未再確認」を出す。
// 再確認を強制はしない。確認済みが無期限の保証に化けるのを防ぐだけ。
const STALE_DAYS = 90;

const staleDays = (verified, generated) => {
  const from = Date.parse(verified);
  const to = Date.parse(generated);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / 86400000);
};

// 採否の表示名。JSON 側の値は load.mjs の検証が使うので変えない。
// 未知の値は落とさずそのまま出す（検証をすり抜けた値を見えなくしないため）。
const DISPOSITION_LABEL = {
  accepted: '採用',
  rejected: '不採用',
  pending: '保留',
};

const EFFECT_LABEL = {
  changed: '判断を変えた',
  confirmed: '判断が裏付けられた',
  rejected: '当てはまらないと退けた',
};

const STYLE = `
:root { color-scheme: light dark; --line: #d0d0d0; --muted: #666; --warn: #8a5a00; }
body { margin: 0 auto; padding: 2rem 1.25rem; max-width: 52rem; font: 15px/1.8 system-ui, sans-serif; }
h1 { font-size: 1.5rem; margin-bottom: .25rem; }
h2 { font-size: 1.15rem; margin-top: 2.5rem; border-bottom: 2px solid var(--line); padding-bottom: .3rem; }
h3 { font-size: 1rem; margin: 1.5rem 0 .4rem; }
h4 { font-size: .9rem; margin: .9rem 0 .2rem; }
.lead, .note { color: var(--muted); font-size: .9rem; }
.caveat { border-left: 3px solid var(--warn); padding: .6rem .9rem; margin: 1rem 0; font-size: .9rem; }
.card { border: 1px solid var(--line); border-radius: 6px; padding: .9rem 1.1rem; margin: .9rem 0; }
.card.gone h3 { text-decoration: line-through; opacity: .6; }
dl { margin: .4rem 0 0; display: grid; grid-template-columns: max-content 1fr; gap: .2rem .8rem; }
dt { color: var(--muted); font-size: .85rem; }
dd { margin: 0; word-break: break-word; }
.unused { color: var(--warn); font-size: .9rem; }
.tag { display: inline-block; border: 1px solid var(--line); border-radius: 3px; padding: 0 .4rem; font-size: .8rem; margin-right: .4rem; }
ul { padding-left: 1.2rem; }
`;

function factCard(fact, hits, generated) {
  const mine = hits.filter((h) => h.item === fact.id);
  const used = mine.length
    ? `<ul>${mine.map((h) => `<li><span class="tag">${esc(EFFECT_LABEL[h.effect] ?? h.effect)}</span>${esc((h.ts ?? '').slice(0, 10))} ／ ${esc(h.topic)}${h.note ? `<br>${esc(h.note)}` : ''}</li>`).join('')}</ul>`
    : '<p class="unused">まだ使われていない（参照 0 件）</p>';
  // 発見元は証拠ではないが、辿れないと「どこから来た話か」を後から確認できない。
  // 動画は消える。タイトルとチャンネルを併記して、リンクが死んでも読めるようにする。
  const age = staleDays(fact.verified, generated);
  const stale = age !== null && age > STALE_DAYS
    ? ` <span class="unused">／ 未再確認 ${age} 日</span>`
    : '';
  const found = (fact.discoveredIn ?? []).map((d) => {
    const label = esc(d.title || d.issue);
    const link = d.videoId
      ? `<a href="https://www.youtube.com/watch?v=${esc(d.videoId)}">${label}</a>`
      : label;
    const meta = [d.channel && esc(d.channel), esc(d.issue)].filter(Boolean).join(' ／ ');
    return meta ? `${link}<br><span class="note">${meta}</span>` : link;
  }).join('<br>');
  return `<div class="card${fact.status === 'superseded' ? ' gone' : ''}">
<h3>${esc(fact.fact)}</h3>
<dl>
<dt>こう振る舞う</dt><dd>${esc(fact.behavior)}</dd>
<dt>適用条件</dt><dd>${esc(fact.scope)}</dd>
<dt>公式一次情報</dt><dd><a href="${esc(fact.source)}">${esc(fact.source)}</a>（確認 ${esc(fact.verified)}${stale}）</dd>
<dt>発見元</dt><dd>${found || '—'}</dd>
<dt>id</dt><dd><code>${esc(fact.id)}</code></dd>
${fact.supersededBy ? `<dt>後継</dt><dd><code>${esc(fact.supersededBy)}</code> に置き換わった</dd>` : ''}
</dl>
<h4>刺さった記録</h4>
${used}
</div>`;
}

function issueSection({ issue, entries }) {
  const rows = entries.map((e) => `<div class="card">
<h3><a href="${esc(e.url)}">${esc(e.title)}</a></h3>
<dl>
<dt>採否</dt><dd>${esc(DISPOSITION_LABEL[e.disposition] ?? e.disposition)}</dd>
<dt>理由</dt><dd>${esc(e.reason)}</dd>
<dt>出た事実</dt><dd>${(e.facts ?? []).length ? e.facts.map((f) => `<code>${esc(f)}</code>`).join(', ') : '—'}</dd>
</dl>
</div>`).join('');
  return `<h3>${esc(issue)}（印 ${entries.length} 件）</h3>${rows || '<p class="note">印の付いた候補なし。</p>'}`;
}

export function renderHtml({ issues, facts, hits, generated = new Date().toISOString().slice(0, 10) }) {
  const active = facts.filter((f) => f.status === 'active');
  const gone = facts.filter((f) => f.status !== 'active');
  const n = (base) => (gone.length ? base + 1 : base);
  return `<!DOCTYPE html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude 自身の更新</title>
<style>${STYLE}</style>
<h1>Claude 自身の更新</h1>
<p class="lead">生成 ${esc(generated)} ／ 有効な事実 ${active.length} 件 ／ 参照記録 ${hits.length} 件</p>
<p class="lead">週次の技術レーダー本体とは別のサブ機能。載せるのは <strong>Claude の振る舞いが変わる事実</strong>だけで、新機能カタログではない。</p>

<h2>1. 採用した事実</h2>
<p class="note">「こう振る舞う」が書けない事実は採らない。適用条件（scope）を条件の外へ一般化しないこと。</p>
${active.map((f) => factCard(f, hits, generated)).join('') || '<p class="note">まだ採用した事実は無い。</p>'}

${gone.length ? `<h2>2. 置き換わった事実</h2>
<p class="note">注入からは外れているが、履歴として残す。</p>
${gone.map((f) => factCard(f, hits, generated)).join('')}` : ''}

<h2>${n(2)}. 候補の採否</h2>
<p class="note">印が付いた候補の全件。外したものも理由つきで残す。「見て外した」と「まだ見ていない」を混ぜないため。</p>
${issues.map(issueSection).join('') || '<p class="note">まだ号がない。</p>'}

<h2>${n(3)}. この記録の読み方</h2>
<div class="caveat">
<p><strong>「使った」という記録は弱い証拠。</strong>判定しているのが書いた本人（Claude）なので、自己申告の域を出ない。</p>
<p><strong>「0 件が続く」という事実は強い証拠。</strong>読まれていれば何かは残るはずで、何も残らないことは書き手の主観に依存しない。</p>
<p>したがってこの層の狙いは実績を誇ることではなく、<strong>不使用を可視化すること</strong>にある。参照 0 件の事実を隠さず出しているのはそのため。</p>
</div>
<p class="note">記録は同意を条件にしない。読んだうえで「今回は当てはまらない」と退けた回（${esc(EFFECT_LABEL.rejected)}）も残す。測っているのは参照されたかどうかであって、従ったかどうかではない。</p>
</html>`;
}
