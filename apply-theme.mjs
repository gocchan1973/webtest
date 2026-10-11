import { readFile, readdir, writeFile } from 'node:fs/promises';

const startMarker = '/* muted-ivory:start */';
const endMarker = '/* muted-ivory:end */';
const themePattern = /\/\* muted-ivory:start \*\/[\s\S]*?\/\* muted-ivory:end \*\//g;

const css = `${startMarker}
:root{color-scheme:light;--bg:#e4ded1;--panel:#f0ebe1;--panel2:#e8e1d5;--ink:#292722;--muted:#6f695f;--line:#b9af9f;--violet:#70577f;--cyan:#3f6f70;--gold:#956c31;--rose:#9a555b;--green:#397051}
body{background:radial-gradient(circle at 90% 0%,#d4c8b7 0,transparent 38rem),var(--bg);color:var(--ink)}
a{color:#5f4770}header,footer{border-color:var(--line)}.lead{color:#4f4b44}.eyebrow{color:#3f6f70}.section-label{color:#956c31}
.pill,.tag{background:#e8e1d5;color:#49453f;border-color:#b9af9f}
.toolbar{background:#eee8dded;border-color:#b9af9f;box-shadow:0 8px 28px #62574618}.toolbar small,.date{color:var(--muted)}
.export{background:#70577f;color:#fffaf0}
.summary-card{background:linear-gradient(145deg,#f5f0e7,#e9e1d5);border-color:#b9af9f}
article,.issue-card{background:linear-gradient(150deg,#f2ede4,#e8e1d5);border-color:#b9af9f;box-shadow:0 16px 42px #62574624}
.rank,.issue-number{background:#ded2e2;color:#5f4770}
.take{background:#e5dce8;color:#332d35}
.note,.diagram,.empty-signal{background:#ebe5da;border-color:#b9af9f;color:#292722}.note h3{color:#3f6f70}.note p{color:#4a4640}.empty-signal p{color:#625d54}
.recheck-radar{background:linear-gradient(145deg,#eee6ef,#e4dccf);border-color:#8f7898}.recheck-card,.recheck-item{background:#eee8dd;border-color:#b5a8ba}.recheck-intro,.recheck-empty-rule{color:#655e56}.recheck-status{background:#dce8de;color:#315f44}
.feedback button{background:#e5ded3;border-color:#a89c8b;color:#302d29}.feedback button.is-active{background:#70577f;border-color:#5d466b;color:#fff}.feedback button[data-feedback="dismiss"].is-active{background:#9a555b;border-color:#83464c;color:#fff}
.work-relevance{background:linear-gradient(135deg,#ebe3d8,#e2d9cc);border-color:#aa9bab}.relevance-state{background:#ded2e2;color:#4f3d5b;border-color:#9d88a8}.work-relevance p{color:#403b37}
.work-link,.related-link,.related-more{background:#e9e1d6;border-color:#a89bad;color:#5a4368}.index-snapshot,.work-snapshot{color:#746d63}.issue-link{color:#292722}
.source-link{background:#f5f0e7;color:#40364a;border-color:#9d88a8}.source-link:hover{background:#e2d7e8;border-color:#70577f}.discovery-link{background:#e2eeee;color:#28585a;border-color:#78a5a6}.discovery-link:hover{background:#d3e2e2;border-color:#3f6f70}.knowledge-relevance{background:#f5f0e7;color:#292722;border-color:#b9af9f;border-left-color:#956c31}.knowledge-relevance h3{color:#76521e}.knowledge-relevance ul{color:#403b37}.knowledge-empty{color:#4a4640}.knowledge-delta{background:#eee3ce;color:#5a431e}.knowledge-status{background:#dce8de;color:#315f44}.knowledge-source{color:#5f4770}.toolbar{color:#292722}.diagram{background:#ebe5da}.feedback button:hover{background:#f2ece2;border-color:#70577f}
.decision{background:#dce8de;color:#28583d;border-left-color:#397051}
.diagram{background:#ebe5da;border-color:#b9af9f;color:#292722}.generated-infographic img{display:block;width:100%;height:auto;min-width:760px}
.diag-card{fill:#f5f0e7;stroke:#b9af9f}
.diag-card-highlight{fill:#ece4ef;stroke:#937ca0}
.diag-card-success{fill:#e1eee4;stroke:#699979}
.diag-badge-default{fill:#e4ded3;stroke:#b9af9f}
.diag-badge-cyan{fill:#dbe8e8;stroke:#78a5a6}
.diag-badge-violet{fill:#e5dce8;stroke:#9d88a8}
.diag-badge-gold{fill:#eee3ce;stroke:#b89965}
.diag-badge-green{fill:#dce8de;stroke:#639975}
.diag-tag-bg{fill:#eae3d6}
.diag-tag-highlight-bg{fill:#e2d6e7}
.diag-tag-success-bg{fill:#d5e5da}
.diag-text-title{fill:#292722}
.diag-text-success-title{fill:#28583d}
.diag-text-sub{fill:#544e45}
.diag-text-micro{fill:#6f695f}
.diag-text-micro-gold{fill:#76521e}
.diag-text-micro-green{fill:#28583d}
.diag-text-badge-default{fill:#49453f}
.diag-text-badge-cyan{fill:#28585a}
.diag-text-badge-violet{fill:#5f4770}
.diag-text-badge-gold{fill:#76521e}
.diag-text-badge-green{fill:#28583d}
.diag-line-flow{stroke:#70577f}
.diag-line-green{stroke:#397051}
.diag-line-violet{stroke:#70577f}
.diag-marker{fill:#70577f}
.diag-marker-success{fill:#397051}
.diag-marker-violet{fill:#70577f}
.diag-icon-stroke-cyan{stroke:#3f6f70}
.diag-icon-stroke-violet{stroke:#70577f}
.diag-icon-stroke-gold{stroke:#956c31}
.diag-icon-stroke-green{stroke:#397051}
.diagram svg text{font-family:"Yu Gothic UI","Hiragino Sans",system-ui,sans-serif}
@media print{body{background:#fff;color:#111}article,.summary-card,.issue-card,.empty-signal,.note,.take,.work-relevance,.recheck-radar,.recheck-item{background:#fff;color:#111;box-shadow:none;border-color:#bbb}}
${endMarker}`;

function setThemeAttribute(html) {
  return html.replace(/<html\b([^>]*)>/i, (_, attributes) => {
    const clean = attributes.replace(/\sdata-theme=(['"])[\s\S]*?\1/i, '');
    return `<html${clean} data-theme="muted-ivory">`;
  });
}

export async function applyTheme(directoryUrl = new URL('.', import.meta.url)) {
  const files = (await readdir(directoryUrl)).filter((name) => name === 'index.html' || /^2026-\d{2}-\d{2}\.html$/.test(name));
  for (const name of files) {
    const url = new URL(name, directoryUrl);
    let html = (await readFile(url, 'utf8')).replace(themePattern, '');
    html = setThemeAttribute(html);
    if (!html.includes('</style>')) throw new Error(`missing style element: ${name}`);
    html = html.replace('</style>', `${css}</style>`);
    await writeFile(url, html, 'utf8');
  }
  return { files: files.length };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:///').href) {
  console.log(await applyTheme());
}
