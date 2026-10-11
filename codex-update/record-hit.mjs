// Codex / OpenAI 更新の参照記録を、検証済み JSONL として1行追記する。
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadFacts } from './load.mjs';

export const EFFECTS = new Set(['changed', 'confirmed', 'rejected']);
export const DATA_DIR = fileURLToPath(new URL('.', import.meta.url));
export const DEFAULT_HITS_PATH = join(DATA_DIR, 'hits.jsonl');

const required = ['topic', 'item', 'effect'];

function requireText(name, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} は空にできません`);
  }
  return value.trim();
}

export async function recordHit({
  dataDir = DATA_DIR,
  hitsPath,
  topic,
  item,
  effect,
  note = '',
  now = new Date(),
} = {}) {
  const values = { topic, item, effect };
  for (const name of required) requireText(name, values[name]);
  if (!EFFECTS.has(effect)) throw new Error(`effect は changed / confirmed / rejected のいずれかです: ${effect}`);
  if (typeof note !== 'string') throw new Error('note は文字列であること');

  const facts = await loadFacts(dataDir);
  const ids = new Set(facts.map((fact) => fact?.id));
  if (!ids.has(item.trim())) throw new Error(`unknown fact id: ${item}`);

  const entry = {
    ts: now instanceof Date ? now.toISOString() : String(now),
    topic: topic.trim(),
    item: item.trim(),
    effect,
    note,
  };
  const destination = hitsPath ?? join(dataDir, 'hits.jsonl');
  await mkdir(dirname(destination), { recursive: true });
  const handle = await open(destination, 'a+');
  try {
    const { size } = await handle.stat();
    let needsNewline = false;
    if (size > 0) {
      const lastByte = Buffer.alloc(1);
      await handle.read(lastByte, 0, 1, size - 1);
      needsNewline = lastByte[0] !== 0x0a;
    }
    await handle.writeFile(`${needsNewline ? '\n' : ''}${JSON.stringify(entry)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
  return entry;
}

export function parseArgs(argv) {
  const args = {};
  const allowed = new Set(['topic', 'item', 'effect', 'note']);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`不明な引数: ${key}`);
    const equalsAt = key.indexOf('=');
    const rawName = key.slice(2, equalsAt < 0 ? undefined : equalsAt);
    const name = rawName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (name === 'help') return { help: true };
    if (!allowed.has(name)) {
      throw new Error(`不明な引数: ${key}`);
    }
    const value = equalsAt < 0 ? argv[++i] : key.slice(equalsAt + 1);
    if (value === undefined || (equalsAt < 0 && value.startsWith('--'))) throw new Error(`${key} の値がありません`);
    args[name] = value;
  }
  return args;
}

export function usage() {
  return 'usage: node record-hit.mjs --topic <案件> --item <fact id> --effect changed|confirmed|rejected [--note <内容> | --note=<内容>]';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
    } else {
      const entry = await recordHit(args);
      console.log(JSON.stringify(entry));
    }
  } catch (error) {
    console.error(`[codex-update] ${error.message}`);
    console.error(usage());
    process.exitCode = 2;
  }
}
