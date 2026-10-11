import { readdir, readFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const legacySourceUrl = new URL('./modern-web-practices.md', root);
const entriesDirUrl = new URL('./entries/', root);

export const aiSearchEntry = Object.freeze({
  path: 'knowledge/AI_SEARCH.md',
  purpose: 'AI が最初に読む固定入口',
});

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value).split(/,\s*/).map((item) => item.trim()).filter(Boolean);
}

function parseLegacyEntries(text) {
  const items = [];
  const blocks = text.split(/\n(?=## )/).slice(1);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const match = lines[0].match(/^## ([^ |]+) \| (.+)$/);
    if (!match) throw new Error(`invalid knowledge heading: ${lines[0]}`);
    const [, id, title] = match;
    const item = {
      id,
      title,
      body: '',
      sources: [],
      related_rules: [],
      related_knowledge: [],
      related_articles: [],
      related_work: [],
      source_kind: 'legacy',
      source_path: 'modern-web-practices.md',
    };
    for (const line of lines.slice(1)) {
      const field = line.match(/^- ([a-z_]+): (.*)$/);
      if (!field) continue;
      const [, key, value] = field;
      if (key === 'sources') {
        item.sources = value.split(/,\s*/).map((entry) => {
          const [url, label] = entry.split('|');
          return { url, label };
        });
      } else if (['related_rules', 'related_knowledge', 'related_articles', 'related_work'].includes(key)) {
        item[key] = normalizeList(value);
      } else {
        item[key] = value;
      }
    }
    item.body = [item.essence, item.use_when, item.avoid_when, item.pitfalls].filter(Boolean).join('\n\n');
    items.push(item);
  }
  return items;
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontMatter(text, sourcePath) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${sourcePath}: missing YAML front matter`);
  const [, yamlText, bodyText] = match;
  const meta = {};
  let currentKey = null;
  let currentObject = null;

  for (const line of yamlText.split('\n')) {
    if (!line.trim()) continue;
    const topLevel = line.match(/^([a-z_]+):(?:\s+(.*))?$/);
    if (topLevel) {
      currentKey = topLevel[1];
      currentObject = null;
      const value = topLevel[2];
      meta[currentKey] = value == null || value === '' ? [] : parseYamlScalar(value);
      continue;
    }

    const listObjectStart = line.match(/^  - ([a-z_]+):\s*(.+)$/);
    if (listObjectStart) {
      if (!currentKey || !Array.isArray(meta[currentKey])) throw new Error(`${sourcePath}: unexpected object list item: ${line}`);
      currentObject = { [listObjectStart[1]]: parseYamlScalar(listObjectStart[2]) };
      meta[currentKey].push(currentObject);
      continue;
    }

    const listScalar = line.match(/^  - (.+)$/);
    if (listScalar) {
      if (!currentKey || !Array.isArray(meta[currentKey])) throw new Error(`${sourcePath}: unexpected list item: ${line}`);
      meta[currentKey].push(parseYamlScalar(listScalar[1]));
      currentObject = null;
      continue;
    }

    const objectContinuation = line.match(/^    ([a-z_]+):\s*(.+)$/);
    if (objectContinuation && currentObject) {
      currentObject[objectContinuation[1]] = parseYamlScalar(objectContinuation[2]);
      continue;
    }

    throw new Error(`${sourcePath}: unsupported YAML line: ${line}`);
  }

  return { meta, body: bodyText.trim() };
}

function extractSection(body, heading) {
  const match = body.match(new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1]?.trim() ?? '';
}

async function parseEntryFile(fileName) {
  const sourcePath = `entries/${fileName}`;
  const text = await readFile(new URL(fileName, entriesDirUrl), 'utf8');
  const { meta, body } = parseFrontMatter(text, sourcePath);
  return {
    id: meta.id,
    title: meta.title,
    topic: meta.topic,
    status: meta.status,
    verified_at: meta.verified_at,
    essence: body.split(/\n\s*\n/)[0]?.trim() ?? '',
    use_when: extractSection(body, 'Use When'),
    avoid_when: extractSection(body, 'Avoid When'),
    pitfalls: extractSection(body, 'Pitfalls'),
    compatibility: extractSection(body, 'Compatibility'),
    accessibility: extractSection(body, 'Accessibility'),
    body,
    related_rules: normalizeList(meta.related_rules),
    related_knowledge: normalizeList(meta.related_knowledge),
    related_articles: normalizeList(meta.related_articles),
    related_work: normalizeList(meta.related_work),
    sources: Array.isArray(meta.sources) ? meta.sources.map((source) => ({ label: source.label, url: source.url })) : [],
    source_kind: 'entry',
    source_path: sourcePath,
  };
}

function validateItem(item) {
  for (const key of ['id', 'title', 'topic', 'status', 'essence', 'use_when', 'avoid_when', 'pitfalls', 'compatibility', 'accessibility', 'verified_at']) {
    if (!item[key]) throw new Error(`missing ${key} in ${item.id ?? item.source_path}`);
  }
  if (!Array.isArray(item.sources) || !item.sources.length) throw new Error(`missing sources in ${item.id}`);
}

export async function loadKnowledgeItems() {
  const legacyText = await readFile(legacySourceUrl, 'utf8');
  const items = [...parseLegacyEntries(legacyText)];
  const entryFiles = (await readdir(entriesDirUrl)).filter((file) => file.endsWith('.md')).sort();
  for (const file of entryFiles) items.push(await parseEntryFile(file));
  items.sort((a, b) => a.id.localeCompare(b.id));

  const seen = new Set();
  for (const item of items) {
    validateItem(item);
    if (seen.has(item.id)) throw new Error(`duplicate knowledge id: ${item.id}`);
    seen.add(item.id);
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    item.related_knowledge = item.related_knowledge.filter((id) => byId.has(id));
  }
  for (const item of items) {
    item.backlinks = items
      .filter((candidate) => candidate.id !== item.id && candidate.related_knowledge.includes(item.id))
      .map((candidate) => candidate.id)
      .sort();
  }
  return items;
}

export async function loadKnowledgeIndex() {
  const items = await loadKnowledgeItems();
  return {
    schemaVersion: 2,
    aiSearchEntry,
    generatedFrom: ['modern-web-practices.md', 'entries'],
    items: Object.fromEntries(items.map((item) => [item.id, item])),
  };
}
