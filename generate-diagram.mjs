import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants, readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('.', import.meta.url);
const tempRoot = process.env.TEMP ?? process.env.TMP ?? 'C:/Users/Owner/.Codex/tmp';

function todayJst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function buildOutputName(articleId, date = todayJst()) {
  return `${date}__${articleId}__infographic.png`;
}

const articleStyles = {
  'search-ai-controls': 'editorial',
  'sheets-formula-repair': 'instructional',
  'copilot-byok': 'professional',
  'npm-staged-controls': 'scientific',
  'workspace-may-drops': 'bento-grid',
  'sheets-mcp-preview': 'instructional',
  'ai-security-detections': 'scientific',
  'pr-archive': 'editorial',
  'setup-java-5-5': 'scientific',
  'gpt-5-6-family': 'professional',
  'chrome-150': 'scientific',
  'workspace-mdm-ou': 'professional',
  'github-models-retirement': 'editorial',
  'node-24-18': 'scientific',
  'gemini-classroom-boundary': 'professional',
  'deno-2-9-5': 'scientific',
  'agents-python-0-19-4': 'instructional',
  'uv-0-12-3': 'scientific',
  'electron-43-3-0': 'professional',
  'langchainjs-local-file-store': 'instructional',
  'npm-publish-scan': 'scientific',
  'github-actions-approval': 'instructional',
  'copilot-managed-settings': 'professional',
  'node-security-july-2026': 'scientific'
};

export function buildStyle(articleId) {
  if (articleStyles[articleId]) return articleStyles[articleId];
  if (/(chrome|node|npm|codeql|wasm|security|hdr)/.test(articleId)) return 'scientific';
  if (/(copilot|gemini|workspace|extensions)/.test(articleId)) return 'professional';
  if (/(issue|formula|agents|mcp|app)/.test(articleId)) return 'instructional';
  return 'auto';
}

export function buildPrompt({ articleId, title, summary, style = buildStyle(articleId) }) {
  return `# TechNews infographic request\n\narticle_id: ${articleId}\n\n## Topic\n${title}\n\n## Editorial intent\n${summary}\n\n## Visual style\nVisual style: ${style}\n\n## Generation requirements\n- Use Nano Banana 2 if available.\n- Create a ${style} editorial infographic, not a generic stock illustration.\n- Use a landscape composition with a clear visual hierarchy and generous whitespace.\n- Japanese text must be accurate and readable（日本語の文字を正確に描画する）.\n- Show the article's causal structure, decision point, or evidence flow visually.\n- Do not invent facts beyond the editorial intent.\n- Output a PNG suitable for embedding into a standalone HTML article.\n`;
}

export function shouldGenerate(exists, force) {
  return force || !exists;
}

const articleMetadata = {
  'search-ai-controls': {
    title: '出典の鎖',
    summary: '候補情報を公式一次情報へ再照合し、事実と判断を分けて追跡可能なHTMLへ残す。',
    style: 'editorial'
  },
  'sheets-formula-repair': {
    title: 'AI数式修復の検算ループ',
    summary: 'AIが示す数式修正候補を、変更前後の差分・再計算・人間承認へ通して復元可能にする。',
    style: 'instructional'
  },
  'copilot-byok': {
    title: 'AIフロントとモデル供給元の分離',
    summary: '複数のモデル供給元を、データ分類・許可プロバイダー・キー管理・人間承認の境界で選択可能にする。',
    style: 'professional'
  },
  'npm-staged-controls': {
    title: '依存パッケージの供給網ゲート',
    summary: 'パッケージ公開とインストール元を明示的に許可し、取得・検証・ロールバックを追跡可能な工程にする。',
    style: 'scientific'
  },
  'workspace-may-drops': {
    title: 'Workspace内完結と独立成果物の両立',
    summary: 'Workspace内のAI・自動化を入力とレビューに使い、構造JSON・HTML・PDFを独立した成果物層として分ける。',
    style: 'bento-grid'
  },
  'system-concept': {
    title: '共通ジョブ正本と複数の発火アダプター',
    summary: 'Workspace Studio、GAS、CLIなどの発火入口を共通ジョブ正本へ接続し、queued・running・done・failed・retryの状態、重複排除、成果物回収、HTML埋め込みまでを一つの追跡可能な流れとして管理する。EM移行の作業ではなく、複数プロジェクトへ再利用できる開発ヒントと採用候補の構想である。',
    style: 'instructional'
  },
  'workspace-studio-layered-protection': {
    title: 'Workspace Studioの多層保護',
    summary: 'フローごとの専用OAuth Client ID、最小スコープ、管理者確認、監査ログ、停止・取消経路を分離し、自動化を安全に運用する。',
    style: 'professional'
  }
};

function execCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('notebooklm', args, { cwd: fileURLToPath(root), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${args.join(' ')}\n${stderr || stdout}`)));
  });
}

export async function runCli(args, { exec = execCli } = {}) {
  try {
    return await exec(args);
  } catch (error) {
    if (!/Authentication expired or invalid/i.test(error?.message ?? '')) throw error;
    await exec(['login', '--browser-timeout', '60']);
    return exec(args);
  }
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

const defaultNotebookId = '87c4b3f0-cf27-4bb1-81a3-0f87436c62f6';

export function getArticleMetadata(articleId) {
  if (articleMetadata[articleId]) return articleMetadata[articleId];
  try {
    const htmlFiles = readdirSync(fileURLToPath(root)).filter(f => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).sort().reverse();
    for (const file of htmlFiles) {
      const content = readFileSync(fileURLToPath(new URL(file, root)), 'utf8');
      const artMarker = `data-article-id="${articleId}"`;
      const idx = content.indexOf(artMarker);
      if (idx !== -1) {
        const artSlice = content.substring(idx, content.indexOf('</article>', idx));
        const titleMatch = artSlice.match(/<h2>(.*?)<\/h2>/);
        const takeMatch = artSlice.match(/<p class="take">(.*?)<\/p>/);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : articleId;
        const summary = takeMatch ? takeMatch[1].replace(/<[^>]+>/g, '').trim() : '記事テーマの構造と判断を視覚化する。';
        return { title, summary, style: buildStyle(articleId) };
      }
    }
  } catch {}
  return { title: articleId, summary: '記事テーマの構造と判断を視覚化する。', style: buildStyle(articleId) };
}

export async function generateDiagram({ articleId, title, summary, notebookId = process.env.NOTEBOOKLM_NOTEBOOK ?? defaultNotebookId, date, style = buildStyle(articleId), force = false }) {
  if (!notebookId) throw new Error('NOTEBOOKLM_NOTEBOOK is required');
  const outputDir = new URL('./assets/diagrams/original/', root);
  const outputName = buildOutputName(articleId, date);
  const outputPath = new URL(outputName, outputDir);
  if (!shouldGenerate(await exists(outputPath), force)) return { status: 'skipped', output: outputName };
  await mkdir(outputDir, { recursive: true });
  const requestPath = join(tempRoot, `${outputName}.md`);
  await writeFile(requestPath, buildPrompt({ articleId, title, summary }), 'utf8');
  const source = JSON.parse(await runCli(['source', 'add', requestPath, '--notebook', notebookId, '--type', 'file', '--json']));
  try {
    await runCli(['source', 'wait', source.source.id, '--notebook', notebookId, '--timeout', '120', '--json']);
    const generated = JSON.parse(await runCli(['generate', 'infographic', '--notebook', notebookId, '--source', source.source.id, '--prompt-file', requestPath, '--orientation', 'landscape', '--style', style, '--detail', 'detailed', '--language', 'ja', '--json']));
    const waited = JSON.parse(await runCli(['artifact', 'wait', generated.task_id, '--notebook', notebookId, '--timeout', '1800', '--interval', '5', '--json']));
    await runCli(['download', 'infographic', fileURLToPath(outputPath), '--notebook', notebookId, '--artifact', waited.artifact_id, '--force', '--json']);
    return { status: 'downloaded', output: outputName, artifactId: waited.artifact_id, sourceId: source.source.id };
  } finally {
    await runCli(['source', 'delete', source.source.id, '--notebook', notebookId, '--yes', '--json']);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const articleId = process.argv[2];
  if (!articleId) throw new Error('Usage: node generate-diagram.mjs <article-id> [--force]');
  const metadata = getArticleMetadata(articleId);
  const result = await generateDiagram({
    articleId,
    title: metadata.title,
    summary: metadata.summary,
    style: metadata.style,
    notebookId: process.env.NOTEBOOKLM_NOTEBOOK ?? defaultNotebookId,
    force: process.argv.includes('--force')
  });
  console.log(JSON.stringify(result));
}
