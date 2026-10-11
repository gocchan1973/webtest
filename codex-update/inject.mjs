// Codex SessionStart 用の注入 CLI。
// 既定は hookSpecificOutput JSON、--text は AGENTS.md 等から読む平文を返す。
import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadAll } from './load.mjs';
import { renderMarkdown } from './render-md.mjs';
import { formatJapanDate } from './date.mjs';

export const DATA_DIR = fileURLToPath(new URL('.', import.meta.url));
export const DEFAULT_MAX_CHARS = 12000;

async function requireCanonicalFacts(dataDir) {
  const factsPath = join(dataDir, 'facts.json');
  try {
    await access(factsPath);
  } catch {
    throw new Error(`canonical facts.json が見つかりません: ${factsPath}`);
  }
}

export async function loadInjectionData(dataDir = DATA_DIR) {
  await requireCanonicalFacts(dataDir);
  return loadAll(dataDir);
}

const countLine = (data, dataDir) => [
  `参照記録: ${data.hits.length} 件（changed / confirmed / rejected の自己記録）`,
  `実際に参照したら記録する: node "${join(dataDir, 'record-hit.mjs')}" --topic "<案件>" --item "<fact id>" --effect changed --note "<何をどう変えたか>"`,
].join('\n');

export function buildContext(data, {
  dataDir = DATA_DIR,
  generated = formatJapanDate(),
  maxChars = DEFAULT_MAX_CHARS,
} = {}) {
  if (!Number.isInteger(maxChars) || maxChars < 80) throw new Error('maxChars は 80 以上の整数であること');
  const body = renderMarkdown({ facts: data.facts, generated });
  const footer = [
    '---',
    '',
    countLine(data, dataDir),
    'この記録は参照されたかどうかを測る自己記録であり、参照 0 件は実際に読まれていない証明ではない。',
    '',
  ].join('\n');
  const context = `${body}\n${footer}`;
  if (context.length <= maxChars) return context;

  const factsPath = join(dataDir, 'facts.json');
  const fallback = [
    '# Codex / OpenAI 自身の更新（自動注入）',
    '',
    `本文が注入上限 ${maxChars} 文字を超えたため、本文は注入していない。`,
    `正本を検証済み。参照記録は ${data.hits.length} 件。必要なときに次を読むこと:`,
    factsPath,
    'AGENTS.md から起動した場合は、管理ブロックの検証済みスナップショットも読むこと。',
    '',
  ].join('\n');
  if (fallback.length <= maxChars) return fallback;
  const minimal = `Codex / OpenAI 更新本文は上限超過。管理ブロックの検証済みスナップショットも読む。正本: ${factsPath}`;
  if (minimal.length <= maxChars) return minimal;
  if (factsPath.length > maxChars) throw new Error(`maxChars が facts.json の絶対パス長未満です: ${maxChars}`);
  return factsPath;
}

export function formatOutput(context, { text = false } = {}) {
  if (text) return `${context.replace(/\n+$/, '')}\n`;
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context.replace(/\n+$/, ''),
    },
  })}\n`;
}

function parseArgs(argv) {
  const args = { text: false, maxChars: DEFAULT_MAX_CHARS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--text') {
      args.text = true;
      continue;
    }
    if (key === '--max-chars') {
      const value = argv[++i];
      if (value === undefined) throw new Error('--max-chars の値がありません');
      args.maxChars = Number(value);
      continue;
    }
    if (key === '--help') return { help: true };
    throw new Error(`不明な引数: ${key}`);
  }
  return args;
}

export function usage() {
  return 'usage: node inject.mjs [--text] [--max-chars <整数>]';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
    } else {
      const data = await loadInjectionData();
      const context = buildContext(data, { maxChars: args.maxChars });
      process.stdout.write(formatOutput(context, args));
    }
  } catch (error) {
    console.error(`[codex-update] ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}
