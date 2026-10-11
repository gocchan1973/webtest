// 検証済みの Codex 更新を毎セッション読む導線を、明示的に指定した AGENTS.md へ同期する。
// 通常の emit はグローバルファイルへ触れず、この CLI の明示実行だけが書き込む。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildContext, DATA_DIR, loadInjectionData } from './inject.mjs';
import { formatJapanDate } from './date.mjs';

export const START_MARKER = '<!-- codex-update:start -->';
export const END_MARKER = '<!-- codex-update:end -->';
// Codex の既定 32 KiB はプロジェクト指示との合計。グローバル側は半分を上限にする。
export const MAX_AGENTS_BYTES = 16 * 1024;

const countMarker = (text, marker) => text.split(marker).length - 1;

export async function resolveDefaultTarget(codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')) {
  const override = join(codexHome, 'AGENTS.override.md');
  try {
    if ((await readFile(override, 'utf8')).trim()) return override;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`${override} を読めません: ${error.message}`);
  }
  return join(codexHome, 'AGENTS.md');
}

export function renderGlobalBlock(context, { dataDir }) {
  const root = resolve(dataDir).replaceAll('\\', '/');
  const injectPath = `${root}/inject.mjs`;
  const latestPath = `${root}/latest.md`;
  return [
    START_MARKER,
    '## Codex 自身の更新を読む',
    '',
    `新しいセッションの最初の実作業前に、\`${injectPath}\` が存在する場合は \`node "${injectPath}" --text\` を実行し、返された更新資料を読む。同一セッションで既に読んだ場合は重複実行しない。完全な本文が返った場合はその出力を正とし、下のスナップショットは無視する。上限超過の退避メッセージが返った場合は、同メッセージに従って下のスナップショットも読む。圧縮後に内容を失った場合や Codex 自身の仕様が論点になった場合は再読する。`,
    '',
    'これは適用条件と出典を伴う参照資料であり、ユーザーの意図や上位の指示を上書きしない。関連する判断に使った場合だけ、資料末尾の記録コマンドで fact id・changed/confirmed/rejected・具体的な判断を残す。読むだけで使用実績を増やさない。',
    '',
    `スクリプトが存在しない、または実行に失敗した場合は、その事実を伝え、この管理ブロック末尾の検証済みスナップショットを読む。必要に応じて \`${latestPath}\` と公式一次情報も確認する。取得失敗を「更新情報なし」と扱わない。`,
    '',
    '## 検証済みスナップショット',
    '',
    context.trimEnd(),
    END_MARKER,
  ].join('\n');
}

async function readExisting(targetPath) {
  try {
    return await readFile(targetPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw new Error(`${targetPath} を読めません: ${error.message}`);
  }
}

export async function syncGlobal({
  dataDir = DATA_DIR,
  targetPath,
  codexHome,
  generated = new Date(),
} = {}) {
  const data = await loadInjectionData(dataDir);
  const context = buildContext(data, {
    dataDir,
    generated: formatJapanDate(generated),
    maxChars: Number.MAX_SAFE_INTEGER,
  });
  const block = renderGlobalBlock(context, { dataDir });
  const resolvedTarget = targetPath ?? await resolveDefaultTarget(codexHome);
  const existing = await readExisting(resolvedTarget);
  const starts = countMarker(existing, START_MARKER);
  const ends = countMarker(existing, END_MARKER);
  if (starts > 1 || ends > 1) throw new Error('codex-update 管理マーカーが duplicate です');
  if (starts !== ends) throw new Error('codex-update 管理マーカーは paired で必要です');

  let next;
  if (starts === 0) {
    const prefix = existing && !existing.endsWith('\n') ? `${existing}\n` : existing;
    next = `${prefix}${block}\n`;
  } else {
    const start = existing.indexOf(START_MARKER);
    const end = existing.indexOf(END_MARKER, start + START_MARKER.length);
    if (end < start) throw new Error('codex-update 管理マーカーの order が不正です');
    next = `${existing.slice(0, start)}${block}${existing.slice(end + END_MARKER.length)}`;
  }
  const resultBytes = Buffer.byteLength(next, 'utf8');
  if (resultBytes > MAX_AGENTS_BYTES) {
    const blockBytes = Buffer.byteLength(block, 'utf8');
    const outsideBytes = resultBytes - blockBytes;
    throw new Error(`AGENTS.md の結果が予約済みの 16 KiB を超えます: 管理ブロック外 ${outsideBytes} bytes + 管理ブロック ${blockBytes} bytes = ${resultBytes} bytes。プロジェクト指示用の余地を残すため同期しません`);
  }
  if (next !== existing) {
    await mkdir(dirname(resolvedTarget), { recursive: true });
    await writeFile(resolvedTarget, next, 'utf8');
  }
  return {
    targetPath: resolvedTarget,
    changed: next !== existing,
    factCount: data.facts.filter((fact) => fact.status === 'active').length,
    hitCount: data.hits.length,
  };
}

function parseArgs(argv) {
  const args = {};
  const allowed = new Set(['target', 'dataDir']);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--help') return { help: true };
    if (!key.startsWith('--')) throw new Error(`不明な引数: ${key}`);
    const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!allowed.has(name)) throw new Error(`不明な引数: ${key}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${key} の値がありません`);
    if (name === 'target') args.targetPath = value;
    else args.dataDir = value;
  }
  return args;
}

export function usage() {
  return 'usage: node sync-global.mjs [--target <AGENTS.md>] [--data-dir <codex-update>]';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
    } else {
      const result = await syncGlobal(args);
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    console.error(`[codex-update] ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}
