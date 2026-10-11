import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { applyRelevance } from './apply-relevance.mjs';
import { applyTheme } from './apply-theme.mjs';
import { generateCompressedImages } from './generate-compressed-images.mjs';
import { loadKnowledgeIndex } from './knowledge/load-items.mjs';
import { relevance } from './relevance.mjs';
import { validateWeeklySelection } from './weekly-selection.mjs';

const knowledgeIndex = await loadKnowledgeIndex();
const EMBEDDED_IMAGE_MAX_WIDTH = 1600;
const ARTICLE_KNOWLEDGE_HINTS = Object.freeze({
  'npm-staged-controls': ['supply-chain-local-or-cdn'],
  'setup-java-5-5': ['supply-chain-local-or-cdn'],
  'youtube-npm-supply-chain': ['supply-chain-local-or-cdn'],
  'github-models-retirement': ['supply-chain-local-or-cdn'],
  'cursor-origin-code-hosting': ['supply-chain-local-or-cdn'],
});

function mergeKnowledgeIds(explicitIds = [], hintedIds = []) {
  return [...new Set([...(explicitIds ?? []), ...(hintedIds ?? [])])].sort();
}

function resolveArticleKnowledge(articleId, explicitIds = []) {
  const knowledgeIds = mergeKnowledgeIds(explicitIds, ARTICLE_KNOWLEDGE_HINTS[articleId] ?? []);
  for (const knowledgeId of knowledgeIds) {
    if (!knowledgeIndex.items[knowledgeId]) {
      throw new Error(`unknown knowledge id for article ${articleId}: ${knowledgeId}`);
    }
  }
  return knowledgeIds;
}

export async function compressPngToDataUri(imageUrl) {
  try {
    const resolvedImagePath = imageUrl instanceof URL ? fileURLToPath(imageUrl) : imageUrl;
    const source = sharp(resolvedImagePath);
    const metadata = await source.metadata();
    const width = Math.min(metadata.width ?? EMBEDDED_IMAGE_MAX_WIDTH, EMBEDDED_IMAGE_MAX_WIDTH);
    const buffer = await source
      .resize({ width, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();

    return {
      mimeType: 'image/png',
      dataUri: `data:image/png;base64,${buffer.toString('base64')}`,
      width,
      originalWidth: metadata.width ?? width,
      originalHeight: metadata.height ?? 0,
    };
  } catch (error) {
    throw new Error(`failed to convert embedded image: ${imageUrl}`, { cause: error });
  }
}

export async function buildEmbeddedImageFigure({ alt, imageUrl }) {
  const { dataUri } = await compressPngToDataUri(imageUrl);
  return `<figure class="diagram article-diagram generated-infographic"><img src="${dataUri}" alt="${alt}" loading="lazy"><figcaption>NotebookLM CLIで生成した図解。記事の判断構造を、後から人間とAIが追跡しやすい形に整理している。</figcaption></figure>`;
}

function knowledgeBlock(ids = [], delta = '') {
  if (!ids.length) {
    return '<section class="knowledge-relevance knowledge-unregistered" aria-label="関連するWeb実装知識"><h3>蓄積知識との接続</h3><p class="knowledge-empty">この記事は記事として登録済みです。現行の再利用知識にはまだ接続していないため、関連知識なしとして追跡します。</p></section>';
  }
  const items = ids.map((id) => {
    const item = knowledgeIndex.items[id];
    if (!item) throw new Error(`unknown knowledge id: ${id}`);
    const sources = item.sources.map((source) => `<a class="knowledge-source" href="${source.url}" target="_blank" rel="noreferrer">${source.label} →</a>`).join('');
    const related = item.related_knowledge?.length ? `<p class="knowledge-related">関連知識: ${item.related_knowledge.map((relatedId) => `<a href="knowledge/wiki/${relatedId}.html">${relatedId}</a>`).join(' / ')}</p>` : '';
    const backlinks = item.backlinks?.length ? `<p class="knowledge-backlinks">逆リンク: ${item.backlinks.map((backlinkId) => `<a href="knowledge/wiki/${backlinkId}.html">${backlinkId}</a>`).join(' / ')}</p>` : '';
    return `<li><a href="knowledge/wiki/${id}.html">${item.title}</a><span class="knowledge-status">${item.status}</span><p>${item.essence}</p><small>検証日: ${item.verified_at}</small>${related}${backlinks}<div class="knowledge-sources">${sources}</div></li>`;
  }).join('');
  return `<section class="knowledge-relevance" aria-label="関連するWeb実装知識"><h3>蓄積知識との接続</h3>${delta ? `<p class="knowledge-delta">今回の差分：${delta}</p>` : ''}<ul>${items}</ul></section>`;
}

import { HARNESS_PROPOSAL_SINCE, HARNESS_FIELD_LABELS, HARNESS_STATUSES, isHarnessProposalIssue, recheckSectionLabel, validateRecheck, loadAgentRecheck, loadRecheckByIssue, warnAgentRecheckFailures } from './recheck-lib.mjs';
// 検証ロジックは recheck-lib.mjs へ移した（段階0）。既存の import 先を壊さないため再 export する。
export { HARNESS_PROPOSAL_SINCE, HARNESS_FIELD_LABELS, HARNESS_STATUSES, isHarnessProposalIssue, recheckSectionLabel, validateRecheck };

// 再判定レーダーの項目は recheck/<号>.json が正本。週次タスクがここへ直接書く。
// ファイルが無い号 = まだ確認していない。空配列 = 公式一次情報を確認して該当なし。

const recheckDir = new URL('./recheck/', import.meta.url);
// 読み込みと全件検証は recheck-lib.mjs の loadRecheckByIssue に一本化（emit-recheck.mjs と同じ経路。Claude 直下の agent 制限もここ）。
const recheckByIssue = await loadRecheckByIssue(recheckDir);

// 段階3: Claude 以外のエージェントの提案（recheck/<agent>/<号>.json）。HTML には載せない（読者向け紙面は Claude 分のみ）。
// 不正なファイルは build を止めず、警告のうえ除外する（Claude 本体の不正は上の throw のまま）。
export const agentRecheck = await loadAgentRecheck(recheckDir);
warnAgentRecheckFailures(agentRecheck.failures);

const issues = [
  { issue:'2026-05-17', start:'2026-05-11', end:'2026-05-17', lead:'道具より先に、境界を固定する。', intro:'LTS、表示標準、エージェント。新技術の採用より、交換可能な境界と復旧可能な成果物を先に決める週。', articles:[
    ['node-22-22-3','Node.js 22.22.3 LTS：薄い補助ランナーを固定する','2026-05-13','Node.js','Windows','公式LTS更新。Windows向け配布物と署名済みハッシュが提供された。','ブラウザ/GASで足りない変換だけを、版とハッシュを固定したCLIへ切り出す。','Nodeを本体にせず、入力→変換→成果物という交換可能な境界にする。','LTS補助処理の更新候補。既存基盤の全面移行理由にはしない。','https://nodejs.org/en/blog/release/v22.22.3'],
    ['chrome-hdr-2094-50','HDR表示も、端末別補正から標準の境界へ','2026-05-14','Chrome','Web標準','SMPTE ST 2094-50は適応メタデータで表示機器ごとのHDR差を扱い、Chromeも将来サポート予定。','端末固有の補正をアプリへ抱えず、標準化された表現層へ寄せる。','構造JSONとHTML/CSS表示層を分け、画面・PDF・印刷差を一箇所で吸収する。','今すぐ実装しない。帳票の表現層分離を後押しする兆候として監視。','https://blog.google/chromium/bringing-a-clearer-more-consistent-hdr-video-experience-to-chrome/'],
    ['copilot-app-preview','隔離された作業セッションを、成果物へつなぐ','2026-05-14','GitHub','Agent','Copilot appのtechnical previewはissue/PRを起点に、分離セッションから検証・PRレビューまでをつなぐ。','エージェント内部の会話ではなく、差分・テスト・判断点をリポジトリ側へ残す。','調査→計画→変更→検証→人間判断を、AI製品をまたいだ共通工程にする。','小さな再実行可能タスクで試す。権限と最終判断は分離。','https://github.blog/changelog/2026-05-14-github-copilot-app-is-now-available-in-technical-preview/'] ]},
  { issue:'2026-05-24', start:'2026-05-18', end:'2026-05-24', lead:'観測・供給網・台帳を一続きにする。', intro:'Chrome拡張の観測、npmの供給網制御、Issueの構造化。別々の機能を「再現可能な変更経路」として束ねる。', articles:[
    ['extensions-io-2026','拡張機能を、エージェントから観測できる対象へ','2026-05-22','Chrome','Extensions','Chrome DevTools for agentsが拡張の導入・再読込・popupやservice workerの検査に対応。権限分離やbrowser namespaceも案内された。','manifest、権限、service worker状態を機械的に再現できれば、後継者の調査負担を減らせる。','拡張UI・service worker・ローカルデータ境界を一つの診断スナップショットにする。','公開自動化ではなく、まず検査と再現に使う。','https://developer.chrome.com/blog/extensions-io-2026'],
    ['npm-staged-controls','npm公開とインストール元に、明示的な門を置く','2026-05-22','npm','Supply chain','staged publishingがGA。install sourceを制限するallow-file、allow-remote、allow-directoryも追加された。','依存ゼロを唱えるより、どの供給元を許可し、どう戻すかを記録する。','ブラウザ配布物と補助CLIで共通のrelease manifestを持つ。','依存を持つ案件から、許可元とロールバック先の記録を試す。','https://github.blog/changelog/2026-05-22-staged-publishing-and-new-install-time-controls-for-npm/'],
    ['github-issue-fields','Issueを自由記述だけでなく、復旧可能な台帳へ','2026-05-21','GitHub','Metadata','組織横断のtyped metadataをIssueへ付与でき、検索・Project・API・webhookから利用可能になった。','データ境界、検証状態、復旧手順を構造化できるが、previewを唯一の正本にはしない。','LinearとGitHubは双方向同期を急がず、役割を分けた片方向連携にする。','既存の正の台帳を変えず、エクスポート可能性を含め評価。','https://github.blog/changelog/2026-05-21-issue-fields-are-now-in-public-preview-for-all-organizations/'] ]},
  { issue:'2026-05-31', start:'2026-05-25', end:'2026-05-31', lead:'AI利用を、差分と測定へ戻す。', intro:'Workspace内のAI、CodeQL、利用コホート。便利さの感想ではなく、変更差分・検査・工程指標で判断する。', articles:[
    ['workspace-may-drops','Workspace内完結と、独立成果物を両立する','2026-05-28','Workspace','AI','Sheetsの表化や異常検知、Meetの記録制御など、Workspace内のAI・自動化が拡大した。','外へ複製する前にWorkspace内完結を検討し、同時に構造JSONで監査と撤退経路を残す。','Sheetsを入力・レビュー面、GASを薄い調整、JSON/HTML/PDFを成果物層にする。','機能ごとに権限と差分保存を確認してから採用。','https://workspace.google.com/blog/product-announcements/may-workspace-drops'],
    ['codeql-2-25-5','AIが変更するworkflowを、決定的検査へ通す','2026-05-28','CodeQL','CI','CodeQL 2.25.5はGitHub Actions等のクエリ精度を改善し、未固定tagなどの検出範囲を広げた。','自動生成されたCIも「動いた」で終えず、供給網と権限差分を継続検査する。','Agentの変更→CodeQL→テスト→人間承認を製品横断の出荷ゲートにする。','利用可能なリポジトリから決定的検査を先行。','https://github.blog/changelog/2026-05-28-codeql-2-25-5-improves-query-accuracy-for-github-actions/'],
    ['copilot-adoption-cohorts','AI導入を利用者数でなく、置き換えた工程で測る','2026-05-29','Copilot','Metrics','usage metrics APIがcode-first、agent-first、multi-agent等のadoption phaseを追加した。','個人評価へ短絡せず、工程別の時間・失敗率・復旧性で自動化の価値を見る。','調査、差分生成、検証ごとに8割自動化の効果を測る。','本文を収集せず、件数・時間・失敗率に限定して評価。','https://github.blog/changelog/2026-05-29-copilot-usage-metrics-api-adds-cohorts-for-ai-adoption/'] ]},
  { issue:'2026-06-07', start:'2026-06-01', end:'2026-06-07', lead:'ブラウザ優先を、計測で更新する。', intro:'Web性能、検索のAI表示、WASM隔離。ブラウザを信仰せず、実測して足りない処理だけを別境界へ出す。', articles:[
    ['chrome-speed-records','ブラウザ性能の前進を、外部基盤追加の前に測る','2026-06-04','Chrome','Performance','ChromeはSpeedometer 3.1とJetStream 3の記録更新と、V8・DOM・CSS等の最適化を報告した。','常駐サーバーを足す前に、実データと実操作に近い小さなベンチで限界を確認する。','帳票・拡張UIをブラウザで測り、ボトルネックだけWorkerやCLIへ分離する。','ベンチ値自体では採用判断しない。実業務の計測条件を作る。','https://blog.google/chromium/a-double-victory-for-web-speed-chrome-breaks-records-again-on-speedometer-31-and-jetstream-3/','','',['js-intersection-observer','html-image-dimensions'],'性能改善のニュースを、スクロール処理と画像の実測へ落とす。'],
    ['search-ai-controls','AIに読まれるHTMLにも、出典の鎖を埋め込む','2026-06-03','Google Search','Provenance','Search ConsoleにAI Search向けcontrols、performance insights、best practicesが発表された。','外部検索へ依存せず、一次データ・対象期間・出典URLを成果物自身に持たせる。','人間、検索、後継AIが同じ根拠を追える構造化HTMLを標準成果物にする。','公開物から生成日時と出典連鎖を整える。','https://blog.google/products-and-platforms/products/search/new-controls-website-owners/'],
    ['wasmer-wasm-node','Dockerなしの隔離実行を、小さく検証する','2026-06-03','WebAssembly','Sandbox','WasmerがNode.js workloadをWASM sandboxで動かす事例を公開した。これは製品保証ではなく採用候補を示す事例。','コンテナ不要の可能性は復旧性に効くが、OS・性能・ファイル境界を実測する必要がある。','変換・検証処理をWASM adapterへ切り出し、ブラウザやデスクトップから交換可能に呼ぶ。','本番移行せず、実データを使わない小さなbenchmark候補。','https://openai.com/index/wasmer/'] ]},
  { issue:'2026-06-14', start:'2026-06-08', end:'2026-06-14', lead:'少ない週は、少ないまま残す。', intro:'確認できた強い更新はChrome拡張の1件。予定や日付の曖昧な情報で埋めず、0件の領域も判断材料として残す。', empty:true, articles:[
    ['chrome-150-extension-limits','タブ操作が広がり、alarm名には上限が入る','2026-06-10','Chrome 150','Extensions','contextMenusがタブストリップと複数選択タブを扱えるようになり、alarm名には1024バイト上限が導入された。','外部常駐補助を減らせる一方、既存拡張は入力長と複数タブ範囲を明示的に試験する。','ブラウザAPI制限とWindows常駐ツールのイベント境界を同じ互換性台帳で管理する。','対象拡張にalarm名検証を追加。タブ操作は要件発生時に採用。','https://developer.chrome.com/docs/extensions/whats-new'] ]},
  { issue:'2026-06-21', start:'2026-06-15', end:'2026-06-21', lead:'規約・費用・データ境界を同時に見る。', intro:'AGENTS.md、AIクレジット、Workspace連携。AIの能力より、誰が何を読み、いくら使い、どこへデータが渡るか。', articles:[
    ['copilot-agents-md','AGENTS.mdを、後継者とAIの共通入口へ','2026-06-18','GitHub','Review','Copilot code reviewがリポジトリレベルのAGENTS.mdを利用可能になった。','規約を長文化せず、テスト、dist、データ境界、復旧入口を検証可能な形で置く。','AIレビュー規約と人間向けrunbookを同じ入口から役割別に辿れるようにする。','短い判断軸を維持し、最終判断は人間レビューへ残す。','https://github.blog/changelog/2026-06-18-copilot-code-review-agents-md-support-and-ui-improvements/'],
    ['copilot-ai-credits','AI費用を、本文を残さず観測する','2026-06-19','Copilot','Cost','usage metrics APIが日次のユーザー別AIクレジット消費を報告できるようになった。','コスト観測は必要だが、入力本文や秘密をログへ残す理由にはしない。','モデル・件数・クレジットだけの横断ダッシュボードで予算ルーティングを調整する。','少量タスクは低コストモデル、難所だけ高推論という実績を測る。','https://github.blog/changelog/2026-06-19-ai-credits-consumed-per-user-now-in-the-copilot-usage-metrics-api/'],
    ['gemini-classroom-boundary','便利なWorkspace連携ほど、既定値と地域を確認する','2026-06-17','Gemini','Data boundary','GeminiのClassroom連携には管理設定があり、対象によって既定ON/OFFが異なり、データ地域化は未対応と明記された。','AI連携は権限、既定値、保存地域、監査が実装要件になる。','Workspace機能ごとの既定値・権限・地域化・撤退手順を一枚の台帳にする。','教育機能の採用ではなく、他の業務AI連携を点検する警告として採用。','https://workspaceupdates.googleblog.com/2026/06/make-gemini-more-helpful-and-relevant-to-your-teaching-goals-with-the-google-classroom-app-in-gemini.html'] ]},
  { issue:'2026-06-28', start:'2026-06-22', end:'2026-06-28', lead:'修復・実行・モデルを交換可能にする。', intro:'Sheetsの数式修復、Node LTS、Copilot BYOK。単一製品に寄せるのでなく、承認と成果物の境界を共通化する。', articles:[
    ['sheets-formula-repair','AIの数式修復を、差分と検算の工程へ置く','2026-06-22','Google Sheets','Gemini','Gemini in Sheetsが周辺データを解析し、数式エラーの説明と修正版を提示する。','AI修正を正本にせず、変更前後の式と再計算結果を保存する。','構造JSON→候補式→人間承認→検算という修復ログをExcel系にも共通化する。','小さな非重要表で、誤修復と復元方法を先に試す。','https://workspaceupdates.googleblog.com/2026/06/troubleshoot-formula-errors-in-sheets.html'],
    ['node-24-18','LTS更新を、暗号・証明書の試験点にする','2026-06-23','Node.js','LTS','Node.js 24.18.0 LTSはWeb CryptographyやBuffer、NSSルート証明書などを更新した。','CurrentよりLTSを優先しつつ、暗号・証明書変更は通信境界のスモークテスト対象にする。','LTS更新ごとに依存、証明書、性能、実データ接続を小さく検証する。','補助CLIで必要な場合のみ更新候補。','https://nodejs.org/en/blog/release/v24.18.0'],
    ['copilot-byok','AIフロントとモデル供給元を分離する','2026-06-23','Copilot','BYOK','Copilot appが複数のクラウド/ローカルプロバイダーを登録でき、キーをOSキーチェーンへ保存するBYOKに対応した。','単一AI基盤への固定を減らせるが、キー管理・監査・プロバイダー差は保守対象になる。','データ分類→許可プロバイダー→人間承認のルーティング表を共通化する。','機密度の低い検証から。BYOK自体を安全性の保証とは扱わない。','https://github.blog/changelog/2026-06-23-github-copilot-app-support-for-byok/'] ]},
  { issue:'2026-07-05', start:'2026-06-29', end:'2026-07-05', lead:'公式サービスにも、終了と委譲がある。', intro:'Chromeの標準、Workspaceの権限委譲、GitHub Modelsの終了。採用時点から交換・退避・最小権限を設計する。', articles:[
    ['chrome-150','OSテーマ統合を、ブラウザ標準へ寄せる','2026-06-30','Chrome 150','CSS','Chrome 150はAccentColor等のCSS機能を含み、OSの表現をWebへ受け渡す範囲を広げた。','独自UI実装を減らせるが、Windows実機と印刷でフォールバックを確認する。','OS設定→Web画面→帳票印刷の適用範囲を同じ視覚試験で確認する。','装飾目的で急がず、必要な画面更新時に段階採用。','https://developer.chrome.com/release-notes/150'],
    ['workspace-mdm-ou','管理権限を、組織単位まで狭める','2026-06-29','Workspace','Least privilege','モバイルデバイス管理権限を組織部門単位で委譲できるようになった。','広域管理者を避け、対象範囲と監査ログを復旧手順へ明記できる。','常駐ツール、Workspace、端末管理を担当OUと復旧権限で対応づける。','管理自動化を作る際の既定設計として採用。','https://workspaceupdates.googleblog.com/2026/06/assign-mobile-device-management-admin-privileges-based-on-organizational-unit.html'],
    ['github-models-retirement','公式AI基盤の終了を、設計条件として受け入れる','2026-07-01','GitHub Models','Retirement','GitHub Modelsは7月30日の完全終了と、その前のbrownout日程を告知した。','公式サービスでも撤退する。交換インターフェース、データexport、手動経路が必要。','AI依存台帳に利用箇所、保存データ、代替、停止試験日を持たせる。','新規依存は作らず、既存利用があれば直ちに棚卸し。','https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/'] ]},
  { issue:'2026-07-12', start:'2026-07-06', end:'2026-07-12', lead:'安全性と費用を、選択可能な設定へ。', intro:'強い更新は2件。署名検証とモデル階層を、個別製品の機能でなく共通の選択・検証ルールとして読む。', empty:true, articles:[
    ['setup-java-5-5','取得物の署名検証を、CIの標準工程へ','2026-07-08','GitHub Actions','Supply chain','setup-java v5.5.0はJDKのdetached GPG署名検証を追加し、完全SHA固定も推奨した。','配布元、検証鍵、Action SHAを明示すれば、後継者の復旧時に暗黙依存を減らせる。','補助CLIを使う案件のCIでも、取得→署名→toolchain→成果物を共通テンプレート化する。','Java限定機能ではなく供給網パターンとして採用。','https://github.blog/changelog/2026-07-08-setup-java-v5-5-0-signature-verification-kona-jdk-and-maven-fixes/'],
    ['gpt-5-6-family','モデルを肩書でなく、仕事と費用で選ぶ','2026-07-09','GPT-5.6','Copilot','CopilotにSol、Terra、Lunaが段階展開され、複雑推論・標準・軽量低コストという役割が明示された。','モデル名を実装へ固定せず、作業種別・費用・権限を設定として交換可能にする。','8割の調査/実装は軽量、難所だけ高推論、最終結果は共通テストで検証する。','下位モデル委任の費用対効果を実績で測る。','https://github.blog/changelog/2026-07-09-openais-gpt-5-6-sol-terra-and-luna-are-now-available-in-github-copilot/'] ]},
  { issue:'2026-07-19', start:'2026-07-13', end:'2026-07-19', lead:'操作面と正本を分け、削除より退避する。', intro:'Sheets MCP、AIセキュリティ検出、PRアーカイブ。AIが触る面と正本・検査・復元の責務を分離する。', articles:[
    ['sheets-mcp-preview','Sheetsを正本ではなく、標準化された操作面へ','2026-07-13','Google Sheets','MCP','Sheets MCP serverがDeveloper Previewになり、AIがセル読取や数式更新を行える。','Previewの操作面に正本を預けず、権限・監査・復旧を先に確認する。','構造JSONを正本にし、MCP/Sheetsを交換可能な入出力adapterに限定する。','非機密・復元可能な表でread-onlyから評価。','https://developers.google.com/workspace/sheets/release-notes'],
    ['ai-security-detections','決定的解析とAI検出を、二層にする','2026-07-14','GitHub','Security','Code scanningがCodeQL未対応領域を補うAI検出をPRに表示するpublic previewを開始した。AI所見はmergeをblockしない。','AI判定を唯一のゲートにせず、テストと人間レビューを残す。','生成物の出所、決定的検査、AI所見、人間承認を同じ出荷記録へまとめる。','費用と対象言語を確認し、補助的検出として評価。','https://github.blog/changelog/2026-07-14-code-scanning-shows-ai-security-detections-on-pull-requests/'],
    ['pr-archive','不可逆削除より、見えなくして戻せる退避を','2026-07-16','GitHub','Recovery','管理者がPRを公開ビューからアーカイブし、後から復元できるようになった。','履歴整理の既定を削除から可逆な退避へ変えられる。','SQLiteや帳票履歴にも公開・アーカイブ・復元の状態遷移を持たせる。','ログ/履歴設計の共通原則として採用。','https://github.blog/changelog/2026-07-16-repository-admins-can-archive-pull-requests/'] ]},
  { issue:'2026-07-26', start:'2026-07-20', end:'2026-07-26', lead:'台帳から実装までをつなぎ、境界は消さない。', intro:'品質ゲート、Sheetsコメント、stateless MCP、Linear agent。横断連携が進むほど、正本・権限・人間判断を明示する。', articles:[
    ['github-code-quality','AIで増やす速度に、独立した品質ゲートを置く','2026-07-20','GitHub','Quality','Code QualityがGA。決定的解析、AI検出、Autofix、coverage、ruleset等を統合する有料機能。','便利だがGitHub依存。ローカルテストと製品非依存の品質指標を残す。','HTML/PDF、拡張、常駐ツールを静的検査・snapshot・人間確認の共通ゲートへ通す。','有料機能は補助。まず既存テストの再現性を優先。','https://github.blog/changelog/2026-07-20-github-code-quality-is-now-generally-available/'],
    ['sheets-comments-api','Sheetsコメントを、正本ではなくレビュー面へ','2026-07-23','Google Sheets','Review','Sheets APIがコメントと返信の作成・更新・削除をDeveloper Previewで提供した。','重要な正本は構造データに置き、コメントは可逆なレビュー補助に限定する。','レポートJSONのreview IDとSheetsコメントを結び、承認状態だけ同期する。','Preview中は実データ書込みを避け、権限モデルを確認。','https://developers.google.com/workspace/sheets/release-notes'],
    ['github-mcp-stateless','連携をステートレスにしても、責任は消えない','2026-07-23','MCP','Architecture','GitHub MCP Serverが次期stateless仕様を先行採用し、Redis session等を除去した。','状態ストア削減は復旧性に効くが、認証・権限・監査は別の境界として残る。','小さなstateless操作＋明示的な正本＋監査ログをChrome/GAS/ローカルで共通化する。','仕様確定後にadapter境界で追随。直接依存を広げない。','https://github.blog/changelog/2026-07-23-github-mcp-server-supports-the-next-mcp-specification/'],
    ['copilot-linear-ga','LinearからDraft PRまで、責務をつないで止める','2026-07-23','Linear','Agent','Linear IssueをCopilot cloud agentへ割当て、一時環境で作業しDraft PRと進捗を返す連携がGAになった。','外部実行環境とリポジトリ権限が境界。AgentはDraft PRまで、人間がmergeを判断する。','Linearをマクロ台帳、各リポジトリを成果物、agentを交換可能な実行者として分離する。','小さな独立タスクで試し、ログと復旧手順を必須にする。','https://github.blog/changelog/2026-07-23-copilot-cloud-agent-for-linear-is-now-generally-available/'] ]},
  { issue:'2026-08-16', start:'2026-08-10', end:'2026-08-16', lead:'動画は入口、採用判断は一次情報へ戻す。', intro:'19チャンネル・直近7日71本から、字幕確認と公式情報への再照合を通過した5テーマ。YouTubeの熱量と、実装へ使える根拠を分けて読む。', diagram:'youtube-pipeline', articles:[
    ['youtube-gpt-token-efficiency','GPT-5.6は、モデル名より仕事あたりの総トークンで測る','2026-08-15','OpenAI','Cost','GPT-5.6の公式ガイドは、Luna・Terra・Solを仕事の難度に応じて使い分け、代表タスクで推論量を一段下げても品質を保てるか比較するよう案内している。','下位モデル委任を「安いから」ではなく、完了までの総トークン・再試行・検証結果で評価できる。','週次収集、実装、レビューを同じ成果物テストへ通し、難所だけ上位モデルへ昇格する。','現在の低コスト委任方針へ導入。品質差は代表タスクで継続測定する。','https://developers.openai.com/api/docs/guides/latest-model','https://www.youtube.com/watch?v=9ZznKEiirAI','まさおAIじっくり解説ch'],
    ['youtube-webmcp','WebMCPは、壊れやすい画面操作をサイト側の道具へ変える','2026-08-11','WebMCP','Browser','Cloudflareの公式資料は、Webサイトが型付きツールをAIへ公開し、スクリーンショット解析やDOMクリックより高速で壊れにくい操作を可能にすると説明している。現状はChrome Betaの実験機能。','ブラウザアプリを固定解とせず、UI・構造化ツール・APIを同じ業務ロジックへつなぐ将来境界として評価できる。','既存画面は人間用のまま、頻出操作だけWebMCP相当の関数として公開し、対応外環境では通常UIへ戻す。','本番導入せず継続監視。小さな非機密デモで標準化と権限モデルを確認する。','https://developers.cloudflare.com/browser-run/features/webmcp/','https://www.youtube.com/watch?v=TocdnAuFSxM','まさおAIじっくり解説ch'],
    ['youtube-workspace-video-manuals','雑な手順メモを、編集可能なスライドへ育てる','2026-08-13','Google Workspace','Handoff','Gemini in Slidesは、Docs・Sheets・PDF・既存スライドなどの参照ファイルを基に、編集可能なプレゼンを生成できる。動画内の動画化部分は、この公式記事だけでは裏付けられないため採用根拠から外す。','後継者向け資料を最初から完璧に書かず、実作業のスクショと短いメモから、編集・修正できる説明物を作れる。','構造化した手順データを正本にし、HTMLとスライドを用途別の表示形式として生成する。動画化は公式根拠と運用条件がそろった時だけ別途評価する。','社内手順書の小さな1本で試す。利用プラン、英語のみの初期提供、参照ファイルの権限範囲を実アカウントで確認する。','https://workspace.google.com/blog/product-announcements/create-on-brand-presentations-in-minutes-with-gemini-in-google-slides','https://www.youtube.com/watch?v=5oA8xiU9LrU','Appsheet教室@イルカのえっちゃんねる'],
    ['youtube-claude-hooks-html','保存時HTML生成は、成果物境界を軽く自動化できる','2026-08-15','Claude Code','Hooks','Claude CodeのHooksは編集後などのイベントでテストや整形処理を決定的に実行できる。動画では、条件を満たすMarkdownだけを標準ライブラリの変換処理へ渡す例が紹介された。','AIの判断で毎回変換させず、対象条件と変換処理を固定すれば、後継者が生成経路を再現しやすい。','ローカル作業では保存時変換、クラウド運用ではGAS時間トリガーとし、同じ入力JSONからHTMLを出す。','補助経路として小さく試験。本体の週次実行はPC非依存のGASを優先する。','https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously','https://www.youtube.com/watch?v=lvOEvLI-bAM','れん学長のAIツール実験室'],
    ['youtube-npm-supply-chain','署名があっても、汚染された生成経路は正当化される','2026-08-15','npm','Supply chain','GitHubはnpmとActionsの攻撃連鎖を受け、重要アカウントの保護、危険なcheckout既定値の変更、staged publishing、install script制御、公開時スキャンを進めた。','provenanceだけを安全判定にせず、誰が何をビルドし、どの依存を実行し、どう戻すかを一続きで管理する必要がある。','重いnpm依存を減らしつつ、残す依存は固定版・実行スクリプト・生成物ハッシュ・復旧先をrelease manifestへ残す。','既存方針へ反映。動画内の個別事件数値は原典未確認のため記事根拠には採用しない。','https://github.blog/security/supply-chain-security/disrupting-supply-chain-attacks-on-npm-and-github-actions/','https://www.youtube.com/watch?v=uaPuE1krfkc','テックニュース@ATI'] ]},
  { issue:'2026-08-23', start:'2026-08-17', end:'2026-08-23', lead:'実験機能を、権限・取消・正本へ戻して読む。', intro:'対象週の公式一次情報で採用できた強い更新は2件。新しい操作面とAI向けホスティングを増やす前に、同一オリジン、明示的な公開、取消可能性、正本と復旧経路の分離を確認する。', empty:true, articles:[
    ['webmcp-imperative-api-2026-08-20','WebMCPの道具公開を、同一オリジン・明示公開・取消で囲う','2026-08-20','Chrome','WebMCP','ChromeのWebMCP Imperative APIは、標準JavaScriptで入力スキーマ付きの道具を登録し、Chrome 153では実行中の道具を壊さずに登録解除できるようになった。クロスオリジンの取得・実行は、許可ポリシーと公開先オリジンの両方を明示しない限り利用できない。','ブラウザ内の業務ロジックを人間UIだけへ閉じず、頻出の読取・検証だけを型付きの小さな道具として切り出せる。ただしこれは早期実験の仕様であり、WebMCPを正本や認可の代替にはできない。','構造JSON・GAS・ネイティブ補助のどれを正本にしても、WebMCP側は3〜5個のallowlistされた読取/検証操作に留める。書込みは既存UIの確認工程を残し、origin・schema・版が変わった時だけ再発見する。','既存のWebMCP契約キャッシュ実験（5-97）へ接続。非機密デモで、取消・クロスオリジン拒否・通常UIへのフォールバックを先に試す。','https://developer.chrome.com/docs/ai/webmcp/imperative-api'],
    ['cursor-origin-code-hosting','AIエージェント向けGitホスティングでも、正本と復旧経路を分ける','2026-08-17','Cursor','Git','CursorはOriginをearly betaとして開始した。Cursorでホストするリポジトリ、ブラウザでの閲覧・検索・PR、選択したGitHubリポジトリとのリアルタイム同期を提供する。','agentとコード・PRを近づけられる一方、ホスティング先のbetaや同期仕様をGitの唯一の正本にすると、移行・障害時の復旧境界が曖昧になる。','Linearをマクロ台帳、Gitリポジトリを成果物正本、agent基盤を交換可能な実行者として分離する。導入するならclone、push、PR、同期解除、GitHub単独復旧を同じ受入試験にする。','現行のGitHub/Linear運用は維持。外部agentへコードを置く試験が必要になった時だけ、非機密の小さなリポジトリで比較する。','https://forum.cursor.com/t/origin-code-hosting/168670','https://www.youtube.com/watch?v=nyINhlct05A','まさおAIじっくり解説ch'] ]},
  { issue:'2026-08-30', start:'2026-08-24', end:'2026-08-30', lead:'自動化には、権限を小さく戻せる境界を置く。', intro:'対象週のYouTube候補81本をRSSで取得し、公式一次情報へ再照合した。今回は、フロー権限、イベント起点の定期実行、ログイン済み作業、一時チャット、複数アカウント接続、agentic containmentという6つの境界を採用した。', candidateCount:81, articles:[
    ['workspace-studio-layered-protection','Workspace Studioは、フロー専用の最小権限と停止経路で囲う','2026-08-25','Google Workspace','Agent security','GoogleはWorkspace Studioのフローごとに、所有者の資格情報をそのまま使わない専用OAuth Client ID、必要最小限のスコープ、管理者の確認設定、監査ログ、フロー停止・スコープ取消を提供すると説明した。','自動化の便利さを理由に、メール・Drive・Chatの横断権限を一括で渡す設計は避けるべきだと具体化された。フローの権限、実行主体、証跡、停止経路を分離すれば、ブラウザ/GAS/外部エージェントのどれを使っても復旧性を保てる。','業務ロジックとデータ正本はローカルまたはGAS側へ残し、Studioは限定した操作アダプターとして扱う。フローごとに必要スコープ・確認点・監査ID・一括停止手順をmanifestへ記録する。','既存のWorkspace／構造JSON案件で、非機密の通知フロー1本だけを候補にする。Drive全権限や無確認の外部送信は最初の試験対象にしない。','https://workspace.google.com/blog/identity-and-security/defend-against-agentic-risks-with-multi-layered-protections-in-google-workspace-studio','https://www.youtube.com/watch?v=MojeJC7Yt_M','こーすけ先生のGoogle塾'],
    ['chatgpt-work-webhooks','定期タスクはポーリングでなく、承認付きのイベント起点へ寄せる','2026-08-25','ChatGPT Work','Automation','ChatGPT Workの定期タスクは、Gmail・Slack・GitHubの更新をWebhookで受けて実行でき、承認が必要な操作では人間確認で停止する。タスクは共有後も各受信者が自分の接続先と予定を持つ独立コピーになる。','定期監視を時間だけで回すと、遅延と不要実行が増える。外部イベント、対象、実行権限、承認点を分けることで、同じ通知を複数の実行主体へ誤配布しにくくなる。','週報・PR確認・Workspace通知は、イベント受信→下書き/検証→人間承認→外部実行を共通工程にする。Webhooksが使えない接続は、最小頻度の監視へ明示的に退避する。','既存の週次Cronは維持し、即時性が必要なGitHub PR確認だけを承認付きイベント起点の候補にする。','https://help.openai.com/en/articles/6825453-gpt-4','https://www.youtube.com/watch?v=rBLuGSnEp60','れん学長のAIツール実験室'],
    ['chatgpt-work-signed-in-browser','ログイン済みサイトの自動作業は、資格情報と作業権限を別に扱う','2026-08-25','ChatGPT Work','Browser security','ChatGPT Workは、対応サイトで人間がログインした後にブラウザ作業を継続できる。資格情報はモデルに見せず、保存もしない一方、ブラウザ履歴は設定から個別または全体で削除できると案内している。','ログインできることは、外部操作を無制限に任せてよい根拠にはならない。認証、閲覧、下書き、送信を分け、送信・公開・削除は人間の直前確認を残す必要がある。','ブラウザ自動化の受入試験に、ログイン手順、閲覧だけの成功、下書き停止、送信直前の確認、履歴削除を加える。認証情報をプロンプトやログへ出さない。','外部サービスは読取または下書きまでで止め、投稿・送信・削除は最終画面で再確認する運用を維持する。','https://help.openai.com/en/articles/6825453-gpt-4','https://www.youtube.com/watch?v=Z1NSYHIR_i0','じゅりん│AIビジネス活用塾'],
    ['temporary-chat-control-boundary','一時チャットは、記憶・プラグイン・保存を開始時に切り替える','2026-08-27','ChatGPT','Data boundary','一時チャットでは、開始時に通常設定のメモリ・プラグイン・カスタム指示を使うか選べる。非パーソナライズではそれらを使わず、新しいメモリや履歴も作らない。必要なら後から通常チャットとして保存できる。','調査や外部情報の確認で、普段の文脈・接続先を持ち込むかは作業単位で決めるべきである。手軽さより、参照範囲と成果を残すかを先に選ぶ方が後で説明できる。','機密度の低い探索は非パーソナライズ一時チャット、継続価値が確認できた結論だけを通常タスク/正本ファイルへ移す二段階にする。','新しい外部連携の調査時は、まず非パーソナライズで根拠だけ確認し、接続や書込みを行う段階で通常タスクへ戻す。','https://help.openai.com/en/articles/6825453-gpt-4','https://www.youtube.com/watch?v=8_oo3HUhrC0','AI整体師'],
    ['multiple-google-account-boundary','複数Googleアカウント接続は、横断検索の前にアカウント境界を表にする','2026-08-28','ChatGPT','Connected apps','ChatGPTではGmail・Google Calendar・Google Contactsについて複数アカウントを同じ会話へ接続できるようになった。個人と業務の予定やメールを横断して扱える一方、接続範囲が会話単位で広がる。','便利な横断検索ほど、誤ったアカウントを読んだり書いたりする事故の面積を増やす。接続したアカウント、用途、許可操作、書込み可否を先に固定する必要がある。','Drive/Calendar/Gmailを扱う自動化は、接続アカウントIDではなく人間向けの用途ラベル、read-only既定、書込み時の対象表示を共通のmanifestへ残す。','業務・個人をまたぐ一括取得は行わず、まずメタデータだけを対象アカウントごとに確認する。','https://help.openai.com/en/articles/6825453-gpt-4','https://www.youtube.com/watch?v=sd_86TUZMfg','AI整体師'],
    ['microsoft-agentic-containment','agentic containmentは、承認前の自律操作を権限・影響範囲・可視性で囲う','2026-08-27','Microsoft Security','Agent governance','Microsoft Securityは、Security Exposure ManagementのSecure Nowガイダンスとして、明示的なユーザー承認なしに起きるagent起点の操作を制約するため、攻撃面の強化、影響範囲の制限、IDと権限の統制、環境全体の可視性を挙げた。','最終出力を人間が読むだけでは遅い。自律操作が実行される前から、権限・到達先・停止可能性・証跡を制御面に置く必要がある。','Webhook、ブラウザ操作、MCP/スキルの各実行口に、read-only既定、最小権限、明示承認、監査ログ、停止手順を同じチェック表で持たせる。','新しいagent連携は、破壊的操作を持たない小さなread-only経路から試し、承認なしの外部送信・書込みは有効化しない。','https://www.microsoft.com/en-us/security/blog/2026/08/27/whats-new-in-microsoft-security-august-2026/','https://www.youtube.com/watch?v=tPccRpOUthk','AI共創イノベーション'] ]},
  { issue:'2026-09-06', start:'2026-08-31', end:'2026-09-06', lead:'高能力化を、モデル選択で終わらせず制御面へ戻す。', intro:'YouTubeのRSS候補94本を発見経路として収集し、公式一次情報を再照合した。今回は、高能力モデルの段階導入、データ保持と除外、PR承認、npm公開を、権限・人間ゲート・復旧可能性の同じ判断軸で読む。', candidateCount:94, diagram:'youtube-pipeline', articles:[
    ['gpt-6-astra-launch','GPT-6 Astraの段階導入は、利用可否と権限設定を別に確認する','2026-09-03','OpenAI','Model governance','OpenAIはGPT-6 Astraを限定組織から段階展開し、ChatGPT、API、Azure、Bedrockへ順次提供すると発表した。Enterpriseでは管理者が有効化でき、開始時は既定でオフと案内している。','高能力モデルの利用可否は、能力比較だけで決められない。組織の有効化、利用枠、接続先、外部操作の承認を別々に観測しないと、設定変更が意図せず実行権限の拡大につながる。','モデル名を業務ロジックへ埋め込まず、モデル選択、許可ツール、承認が必要な操作、成果物の保存先を設定とmanifestで分離する。','既存のモデル振り分けを維持し、非機密・read-onlyの検証タスクでのみ比較する。外部送信・公開・削除を含む作業はモデル変更だけを理由に自動化しない。','https://openai.com/index/gpt-6-astra/','https://www.youtube.com/watch?v=8O98ATiOnXw','まさおAIじっくり解説ch'],
    ['gpt-6-astra-safety','Critical級のサイバー能力は、隔離・監視・停止を先に設計する','2026-09-03','OpenAI','Safety boundary','OpenAIはGPT-6 AstraをPreparedness Framework上のCriticalなサイバー能力と位置づけ、内部利用・展開に隔離、暗号化、軌跡とChain of Thoughtの監視、ブロック型評価を強化したと説明した。','能力が上がるほど、実行前の環境分離と途中停止が重要になる。最終出力だけを見る運用では、到達先や副作用を抑えられない。','高リスクの自動化は、対象を限定したsandbox、最小権限、操作ログ、昇格前レビュー、停止可能なジョブ状態を共通の受入条件にする。','現行の回復ハーネスを優先し、強いモデルを理由に全権限や常時実行へ広げない。','https://openai.com/index/safety-overview-gpt-6-astra/','https://www.youtube.com/watch?v=F2Cvjxhv3HQ','AI時短ラボ'],
    ['claude-fable-5-1','Claude Fable 5.1は、長期タスクでもデータ保持条件を先に確認する','2026-09-01','Anthropic','Data governance','AnthropicはClaude Fable 5.1をコーディングと知識作業向けに発表した。GitHub Copilotでの提供では安全分類器のため既定でデータ保持を要し、対象Enterpriseには期限付きのZero Data Retention例外が案内されている。','同じモデルでも、提供経路で保持条件と有効化手順が変わる。長期タスクの委任前に、入力・出力・監査用データがどこへ残るかを確認する必要がある。','モデルごとでなく経路ごとに、保持条件、利用可能なプラン、管理者ポリシー、read-only試験の可否を台帳化する。','機密データを使う案件へ直ちに接続せず、公開済みの小さなリポジトリで保持条件とログを検証する。','https://www.anthropic.com/claude/fable','https://www.youtube.com/watch?v=3OpOwED2sBQ','まさおAIじっくり解説ch'],
    ['anthropic-efs','Enterprise Frontier Safeguardsは、監視と顧客管理データを分離する設計候補','2026-09-01','Anthropic','Enterprise safeguards','AnthropicはEnterprise Frontier Safeguardsを発表し、顧客管理のクラウド基盤へデータを置きながら不正利用検知を組み合わせる計画を示した。段階的提供であり、現時点では将来の提供条件として扱う必要がある。','ゼロ保持か監視かの二択にせず、誰が保存基盤・暗号鍵・承認を管理するかを分けて評価する余地がある。ただし計画段階の機能を現行の保証として採用してはならない。','外部AIの採用評価表に、保存先、鍵の管理者、監視の目的、提供時期、撤退方法を別欄で持たせる。','EFSの実利用は待ち、現行ではローカル正本・read-only・明示承認の境界を維持する。','https://www.anthropic.com/news/enterprise-frontier-safeguards','https://www.youtube.com/watch?v=1HtCq2wP05I','まさおAIじっくり解説ch'],
    ['gemini-3-8-flash','Gemini 3.8 Flashは、低コスト化とサイバー用途を別評価にする','2026-09-02','Google','Model routing','GoogleはGemini 3.8 Flashと3.8 Flash Cyberを発表し、前者をエージェント型ワークフロー向け、後者をサイバーセキュリティ用途向けの派生として案内した。価格と提供経路は期間・プランで変動する。','速さや価格だけで高リスク用途まで同じルーティングにしてはいけない。タスクの目的、データ分類、必要なツール、失敗時の復旧経路を先に分ける方が環境に依存しない。','モデル振り分けは、定型収集、通常実装、高リスク検証を別キューにし、後者は常に人間承認と隔離環境を必須にする。','既存のJS/TS中心の実装を置換せず、低リスクの調査・整形で費用と再試行回数を測る。','https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/','https://www.youtube.com/watch?v=HN_L_Px0QG0','まさおAIじっくり解説ch'],
    ['copilot-content-exclusions','Copilot CLIのcontent exclusionsは、秘密を渡さない境界をポリシーへ寄せる','2026-09-02','GitHub Copilot','Context boundary','GitHubはCopilot appとCopilot CLIが、enterprise・organization・repository管理者のcontent exclusionポリシーを尊重し、除外ファイルをエージェントのコンテキストに使わないことをGAとして案内した。','プロンプトで秘密を避けるだけでは、リポジトリ内の対象範囲を一貫して守れない。コンテキスト境界をポリシー化し、生成物やログの境界と合わせて確認する必要がある。','秘密・鍵・顧客データの置き場をまず分離し、ツール側の除外設定は追加の防御層として扱う。除外設定があってもログや外部送信の確認を省略しない。','既存の秘密管理を置き換えず、非機密のテストリポジトリで除外対象が実際に読まれないことを確認してから評価する。','https://github.blog/changelog/2026-09-02-content-exclusions-generally-available-in-copilot-app-and-cli/','https://www.youtube.com/watch?v=uQNpwmPuNYE','テックニュース@ATI'],
    ['copilot-review-approval','CopilotのPR承認は、人間のマージ判断を置き換えない','2026-09-01','GitHub Copilot','Review governance','GitHubはCopilot code reviewの承認評価と、管理者が有効化した場合に必要承認数へ数えられるPR承認をpublic previewとして発表した。既定ではオフで、新しいcommitがpushされると承認は失効する。','AIの承認表示をマージの自動許可と混同すると、責任分界が崩れる。承認を使う場合も、対象パス、必須テスト、人間の最終判断を独立したゲートとして残す必要がある。','AIレビューは差分指摘と検査補助に限定し、マージ判定は人間が担う現在の運用を維持する。必要なら承認対象パスを狭く固定する。','本リポジトリ群ではAI承認を有効化せず、既存のテスト・レビュー・人間マージを正とする。','https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests/','https://www.youtube.com/watch?v=So8zrulD_7k','テックニュース@ATI'],
    ['npm-multiple-trusted-publishing','npmの複数trusted publishing設定は、公開経路ごとの人間ゲートを残す','2026-09-03','npm','Supply chain','GitHubはnpmで複数の独立したOIDC trusted publishing設定、マルウェアスキャン完了後のstaged package承認、staged履歴表示がGAになったと発表した。各設定は加算的で、直接公開は設定ごとのopt-inである。','複数の公開経路を許可するほど、どのworkflowが何を公開できるかを追跡可能にする必要がある。stage→scan→人間承認→公開の分離は、供給網の復旧性を保つ。','配布物ごとにworkflow、OIDC条件、stage可否、承認者、復旧版をmanifestへ記録し、公開は直接経路でなくstageを既定にする。','npm公開が必要な時だけ、非本番パッケージでstageと承認履歴を確認する。既存の配布手順を無断で変えない。','https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/','https://www.youtube.com/watch?v=So8zrulD_7k','テックニュース@ATI'] ]},
  { issue:'2026-09-13', start:'2026-09-07', end:'2026-09-13', lead:'能力の更新を、実行権限と復旧経路へ戻す。', intro:'YouTubeのRSS候補87本を発見経路として収集し、公式一次情報を再照合した。画像生成、モデル・CLI更新、エージェント権限、AIレビュー、npm保護を、データ境界・人間承認・可逆性の共通条件で読む。採用7件の図解は専用NotebookLMで生成・取得し、記事ごとにPNGとして埋め込んだ。', candidateCount:87, diagram:'youtube-pipeline', articles:[
    ['chatgpt-images-2-5','ChatGPT Images 2.5は、生成物の共有前に来歴と承認を残す','2026-09-08','OpenAI','Image workflow','OpenAIはChatGPT Images 2.5を発表し、より精密な編集、スケッチ、テンプレート、画像へのコメント、プロンプト共有を導入した。APIには高速なFlareと精密なSunburstが追加された。','画像の作成・編集が速くなっても、参照画像、生成物、公開先の境界は自動では定まらない。共有前の確認と元データの扱いを工程として残す必要がある。','画像依頼は入力素材の利用許可→生成→対象箇所の確認→成果物保存→公開承認に分け、生成モデル名を正本データへ埋め込まない。','既存のローカル成果物優先を維持する。対外共有や人物を含む参照画像は、人間が対象と公開範囲を確認してから進める。','https://openai.com/index/introducing-chatgpt-images-2-5/','https://www.youtube.com/watch?v=QTyMB_dTB2c','まさおAIじっくり解説ch'],
    ['deepseek-v4-1-flash','DeepSeek-V4.1-Flashは、低コスト化と処理境界を同時に測る','2026-09-10','DeepSeek','Model routing','DeepSeekはV4.1-Flashを発表し、552B MoEで入力8B・出力16Bを有効化する非対称構成、ネイティブ視覚理解、従来世代より小さいKVキャッシュを案内した。','より速い推論や小さいキャッシュは、データ分類・再試行・復旧の設計を省ける理由にはならない。モデル差を業務ロジックへ固定せず、測定可能な交換境界に置く必要がある。','定型収集、通常実装、高リスク検証を別キューにし、入力種類・出力保存先・費用・再試行回数を記録して比較する。','非機密の変換・要約だけで費用と失敗率を測る。正本の更新、外部送信、権限変更をモデル変更だけで自動化しない。','https://www.deepseek.com/en/news/deepseek-v4-1-flash/','https://www.youtube.com/watch?v=bgS85ZXOlK8','まさおAIじっくり解説ch'],
    ['copilot-hydrafusion','Copilot CLIのHydraFusionは、経路選択を監査可能な設定に戻す','2026-09-10','GitHub Copilot','Model orchestration','GitHubはCopilot CLIのexperimental機能としてProject HydraFusionを案内した。ローカル・クラウド・複合モデル間で、性能、費用、待ち時間を釣り合わせるワークフローを自動選択する。','自動ルーティングは便利でも、どの入力がどの実行基盤へ渡るかを曖昧にするとデータ境界と復旧手順が追えなくなる。','入力分類、許可する実行先、外部接続、成果物保存先、手動フォールバックを設定として分離し、実行ログで選択結果を確認する。','実験機能は採用しない。既存の明示的なモデル振り分けを正とし、非機密のread-only課題でのみ比較候補にする。','https://github.blog/changelog/2026-09-10-github-copilot-weekly-releases-september-7/','https://www.youtube.com/watch?v=GfCFw9gqBYk','まさおAIじっくり解説ch'],
    ['copilot-managed-permissions','Copilot agent操作の中央権限は、最小権限を後退させない','2026-09-09','GitHub Copilot','Permission boundary','GitHubはCopilot Business/Enterprise向けに、shell、ファイル読取・編集、ネットワークドメインを、禁止・人間承認・無確認に中央管理できる機能をGAとして案内した。制限は利用者・workspaceの設定や過去の承認で弱められない。','AI利用の権限はプロンプト上の約束ではなく、実行面の強制可能な境界で確認する必要がある。中央ポリシーも全権限の既定値にはしない。','read-only既定、対象パスと到達ドメインのallowlist、書込み前承認、操作ログ、停止手順を、各CLIやブラウザ自動化の共通受入条件にする。','既存のローカル実行規約を維持する。導入検討は、権限を弱めない非機密の検証環境から始める。','https://github.blog/changelog/2026-09-09-enterprise-managed-permissions-for-github-copilot-agent-operations/','https://www.youtube.com/watch?v=tFtcynD96uo','れん学長のAIツール実験室'],
    ['npm-recovery-security-hold','npmの復旧コード保護は、公開停止を復旧設計に含める','2026-09-09','npm','Supply chain','npmは復旧コードでのサインイン後、全アカウントに72時間のsecurity holdを適用した。公開やアクセストークン作成などの安全上重要な書込みは止まる一方、閲覧とインストールは継続できる。','復旧を急ぐ局面ほど、侵害された認証情報での公開を遅らせる安全弁が要る。停止中でも確認・検証・復旧版の準備を続けられる手順を分ける必要がある。','公開手順に、復旧コード利用の記録、保留期間、既存版の検証、代替の配布判断、保留解除後の人間承認を加える。','公開を伴う案件だけの比較候補に留める。トークンや復旧コードをログ・Issue・AI入力へ残さない。','https://github.blog/changelog/2026-09-09-npm-extends-recovery-code-security-holds-to-all-accounts/','https://www.youtube.com/watch?v=cO0snUdARws','テックニュース@ATI'],
    ['claude-code-2-1-269','Claude Code 2.1.269は、プラグイン評価を再現可能な検査へ寄せる','2026-09-11','Claude Code','Plugin evaluation','AnthropicはClaude Code v2.1.269で、プラグインのeval suiteをJSONとHTMLのスコア付きレポートとして実行するclaude plugin evalを追加した。出力スタイルの切替や、Bash編集差分の表示も追加された。','プラグインの説明や単発成功ではなく、固定した入力・評価結果・差分で再現できる検査が後継担当者の判断を支える。','スキル・プラグインの受入条件を、仕様、最小サンプル、決定的テスト、実行差分、復旧手順に分け、外部接続を要する評価は隔離する。','既存スキルを一括変換しない。対象を一つに絞り、非機密fixtureで評価結果を確認してから採否を判断する。','https://github.com/anthropics/claude-code/releases/tag/v2.1.269','https://www.youtube.com/watch?v=ZUK_iYC2eLU','テックニュース@ATI'],
    ['copilot-review-analysis','Copilot code reviewの自動解決は、未解決の人間判断を見えやすくする','2026-09-11','GitHub Copilot','Review governance','GitHubはCopilot code reviewが対応済みコメントを再レビュー時に自動解決し、提案適用時のcommit messageを生成する更新を案内した。Lite reviewはshell toolと複数agentの分析を使う。','AIがコメントを閉じても、設計判断やリスク受容まで完了したことにはならない。自動解決の対象と、人間が残すレビュー・マージ責任を分ける必要がある。','レビュー運用は、AIの指摘、必須テスト、人間が読む未解決論点、マージ承認を独立したゲートとして保持する。自動解決の履歴も確認可能にする。','AIレビューは補助に留め、人間のマージ判断を維持する。高リスクの変更はAI解決済みでも再確認対象にする。','https://github.blog/changelog/2026-09-11-auto-resolution-and-analysis-updates-in-copilot-code-review/','https://www.youtube.com/watch?v=J4WIEm2Fc6A','テックニュース@ATI'] ]},
  { issue:'2026-09-20', start:'2026-09-14', end:'2026-09-20', lead:'自動化の便利さを、実行境界と人間ゲートへ戻す。', intro:'YouTubeのRSS候補65本を発見経路として収集し、対象週に公開された公式一次情報へ再照合した。モデル選択、実行トリガー、供給網、レビュー、利用計測を、後継担当者が再現・停止・復旧できる境界として読む。図解は1件のPNG生成・埋め込みを確認した。NotebookLMの認証期限切れで残る5件はアクセシブルなSVGフォールバックを維持し、再認証後に重複なく再開する。', candidateCount:65, diagram:'youtube-pipeline', articles:[
    ['copilot-auto-model-selection','Copilotの自動モデル選択は、費用設定と実行先の記録を分ける','2026-09-14','GitHub Copilot','Model routing','GitHubはCopilotのauto model selectionで、組織がcost、balanced、qualityの優先度を選べる設定を公開した。モデル選択は固定ではなく、利用状況に応じて更新される。','費用と品質の選択を自動化しても、入力がどの実行先へ渡ったか、失敗時にどの手動経路へ戻るかは別に追跡しなければならない。','タスク分類、許可する実行先、保存先、費用上限、再試行・手動フォールバックを設定と実行記録で分離する。','既存の明示的なモデル振り分けを置換せず、非機密・read-onlyの定型処理で比較する。','https://github.blog/changelog/2026-09-14-configure-cost-and-quality-in-copilot-auto-model-selection/','https://www.youtube.com/watch?v=i1aqEO2iFDU','まさおAIじっくり解説ch'],
    ['copilot-custom-properties','Copilotのcustom properties提案は、台帳の正本と補助入力を混同しない','2026-09-15','GitHub Copilot','Data boundary','GitHubはCopilotがorganization custom propertiesの定義案を提示できる機能を公開した。提案は管理者が確認してから定義へ反映する。','AIが分類項目を提案しても、台帳の意味や必須性は自動で確定しない。生成した候補と正本スキーマの変更を分ける必要がある。','構造JSONやLinearの正本項目は人間レビュー付きの変更として扱い、AI案は下書き・検証・差分確認を経て採否を決める。','既存案件の項目を一括変更しない。まず非機密のサンプルで、差分と復元手順が追えるか確認する。','https://github.blog/changelog/2026-09-15-github-copilot-suggests-custom-properties-definitions/','https://www.youtube.com/watch?v=YhyjMcYhzII','まさおAIじっくり解説ch'],
    ['actions-workflow-execution-protections','GitHub Actionsの実行保護は、誰が何を起動できるかを分ける','2026-09-17','GitHub Actions','Execution boundary','GitHubはActionsのworkflow execution protectionsをGAにし、実行者・イベント・workflowファイル単位のallowlist、evaluate mode、REST APIを提供した。','自動化はworkflowの内容だけでなく、誰がどのイベントで起動できるかを明示しなければ、意図しない実行経路を残す。','自動実行にはactor・event・対象workflowの三層allowlistと、enforce前に影響を見るevaluate段階、停止・復旧手順を持たせる。','既存CIや公開フローを無断変更しない。外部起点のworkflowだけを対象に、まず評価モード相当の記録から点検する。','https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available/','https://www.youtube.com/watch?v=Hg_-PGxqXtU','テックニュース@ATI'],
    ['copilot-cli-usage-metrics','CLIカスタマイズの利用計測は、効果とプライバシーを別に確認する','2026-09-17','GitHub Copilot','Operational metrics','GitHubはCopilot CLIのusage metrics APIに、skills、custom agents、MCP servers、slash commands、pluginsの利用数と種類数を追加した。顧客定義名は表示せずotherへ集約される。','導入数だけでは有効性を判断できず、計測の粒度が細かすぎれば運用情報の境界も曖昧になる。失敗接続も件数へ含まれる点も区別が必要である。','効果測定は実行回数、成功・失敗、再試行、成果物検証を分け、個人や入力本文を収集しない集計値で運用改善を判断する。','現行のローカル実行ログを置換しない。外部計測を使う場合だけ、保持項目・閲覧権限・解釈の限界を先に記録する。','https://github.blog/changelog/2026-09-17-agentic-cli-customizations-now-in-the-usage-metrics-api/','https://www.youtube.com/watch?v=nhgSssp4l8U','AI時短ラボ'],
    ['npm-stage-only-tokens','npmのstage-only tokenは、公開権限を承認前で止める','2026-09-18','npm','Supply chain','npmはstage onlyのgranular access tokenを追加し、自動workflowにはstaged versionの提出だけを許可し、公開は2FAを持つmaintainerの承認へ分離した。既存tokenの権限は変わらない。','公開を自動化しても、成果物の検査と人間の公開判断を同じtokenへ渡さない方が、侵害時の影響と復旧範囲を小さくできる。','配布はstage、検査、承認、公開、復旧版の状態を分け、tokenの対象packageと残る書込み権限をmanifestで追跡する。','npm公開が必要な配布物だけの候補に留める。tokenや2FA情報をログ・Issue・AI入力へ残さない。','https://github.blog/changelog/2026-09-18-stage-only-npm-tokens-for-safer-automation/','https://www.youtube.com/watch?v=egyqF0oj35s','AI時短ラボ'],
    ['copilot-review-experience','Copilotレビューの進捗表示は、人間の未解決判断を残す','2026-09-18','GitHub Copilot','Review governance','GitHubはCopilot code reviewのoverviewでopen、resolved since last review、previously missedを分け、resolution reasonと一括提案へのcommit messageを提供した。','解決済み表示は、修正の検出を助けるが、設計判断やリスク受容まで完了した証拠ではない。レビューの責任と変更履歴を分けて残す必要がある。','AIの所見、決定的テスト、人間が読む未解決論点、マージ承認を独立したゲートとして記録し、AIのauto-resolutionは補助情報として扱う。','既存の人間マージ判断を維持する。高リスク変更はAIがresolvedでも差分・テスト・受入条件を再確認する。','https://github.blog/changelog/2026-09-18-copilot-code-review-an-improved-review-experience/','https://www.youtube.com/watch?v=bZZ9B450VR8','テックニュース@ATI'] ]},
  { issue:'2026-09-27', start:'2026-09-21', end:'2026-09-27', lead:'能力向上を、権限・費用・人間の判断点へ戻す。', intro:'YouTubeのRSS候補90本を発見経路として収集し、対象週に公開された公式一次情報へ再照合した。低コストモデル、音声操作、音声生成、ローカル実行隔離、レビュー計測を、データ境界・復旧性・人間承認の共通条件で読む。NotebookLMの認証状態は1件だけ直列確認し、PNGが使えない場合はアクセシブルなSVGフォールバックを維持する。', candidateCount:90, diagram:'youtube-pipeline', articles:[
    ['gpt-6-sol-luna','GPT-6 Sol/Lunaは、能力名でなく仕事・費用・検証で振り分ける','2026-09-22','OpenAI','Model routing','OpenAIはGPT-6 SolとGPT-6 Lunaを発表し、Solを複雑な業務向け、Lunaを低コストの反復向けとして位置づけた。両者は同じモデル名を固定するのでなく、推論努力と用途に応じて使い分ける前提で提供される。','低コスト化は、正本更新や外部操作の権限を広げる理由にはならない。作業種別、入力の機密度、許可ツール、成果物検証、手動復帰をモデル選択と別に記録する必要がある。','調査・定型実装・高リスク検証を別キューにし、同じ受入テストで品質、再試行、総費用を比較する。ブラウザ/GAS/ローカル補助のどれでも、業務ロジックとモデル名を分離する。','非機密かつread-onlyの代表課題で比較する。モデル更新だけを理由に外部送信、公開、正本更新を自動化しない。','https://openai.com/index/introducing-gpt-6-sol-and-luna/','https://www.youtube.com/watch?v=Z2-Btkv3K9k','まさおAIじっくり解説ch'],
    ['claude-opus-5-5','Claude Opus 5.5は、長時間作業でもデータ保持条件を先に確認する','2026-09-22','Anthropic','Data boundary','AnthropicはClaude Opus 5.5を公開し、Opus 5より低いコストと、APIアカウント作成日が条件となるpreserved thinkingを案内した。ゼロデータ保持の提供経路も明示されている。','高能力・低コストの評価と、コンテキストがどこに残るかは別の論点である。後継者が再現するには、モデル名だけでなく提供経路、保持条件、認証・権限、撤退時の手動経路を残す必要がある。','外部AIの採用表に、用途、入力分類、保持条件、許可ツール、出力保存先、切替手順を分けて記録する。ネイティブ依存は小さな実行アダプターへ閉じる。','既存のモデル振り分けを置換しない。非機密の評価入力で、利用契約と保持条件を確認できる時だけ比較する。','https://www.anthropic.com/claude-opus-5-5','https://www.youtube.com/watch?v=HkhCUPoLv6M','まさおAIじっくり解説ch'],
    ['gemini-3-8-flash-tts','Gemini 3.8 Flash TTSは、声の生成と同意確認を分離する','2026-09-22','Gemini API','Voice safety','GoogleはGemini 3.8 Flash TTSとFlash-Lite TTSをGAにし、Voices API、テキストからの声設計、同意確認付きのvoice replicationを案内した。','自然な音声生成は、本人性・同意・保存先・公開範囲を曖昧にしやすい。生成品質と、誰の声をどの目的で扱えるかの判断は独立させる必要がある。','音声ワークフローを、台本、同意確認、生成、ローカル検査、公開承認、削除・差替えの状態へ分ける。ブラウザ/GASの業務ロジックは音声基盤から独立させる。','本人音声や業務音声は自動投入しない。非個人の短いテスト台本で、出力形式・保存先・削除手順を確認してから評価する。','https://ai.google.dev/gemini-api/docs/changelog','https://www.youtube.com/watch?v=sRPF896FERI','まさおAIじっくり解説ch'],
    ['chatgpt-work-voice-plugins','ChatGPT WorkのVoiceは、接続済み権限と発話を分けて扱う','2026-09-23','ChatGPT Work','Permission boundary','OpenAIはVoiceでpluginsと接続済みアプリを使えるようにし、Workでは文書作成、ブラウザ作業、通話終了後のテキスト継続を案内した。Voiceの有効化はWorkやブロック済みpluginを有効化せず、必要な操作は画面で承認する。','音声は操作の入口を変えるだけで、接続先のデータ権限や外部書込みの危険を消さない。発話、読取り、下書き、承認、送信を別段階として残す必要がある。','音声入力は依頼の記録までに留め、接続アプリの読取り・書込みは既存の最小権限と人間承認へ通す。停止後のテキスト継続にも同じデータ境界を適用する。','業務データへの接続は増やさない。既存接続で非機密の下書き作成だけを候補にし、送信・公開・削除は最終画面で人間が確認する。','https://openai.com/products/release-notes/','https://www.youtube.com/watch?v=U-squCdsm9M','じゅりん│AIビジネス活用塾'],
    ['copilot-local-sandboxing','Copilot Appのローカルsandboxは、隔離と復旧手順を一緒に検証する','2026-09-23','GitHub Copilot','Execution isolation','GitHubはCopilot Appで、ファイル、ネットワーク、資格情報への到達を制限するローカルsandboxを案内した。利用者はsandboxの強さと、必要な接続を用途ごとに選ぶ。','隔離設定の存在だけでは、実行が安全だった証拠にならない。対象パス、ネットワーク許可、資格情報、失敗時の停止、通常環境への影響を実際の受入試験で分ける必要がある。','ローカル実行はread-only・限定パス・限定ドメインから開始し、成果物・ログ・復元手順を独立保存する。ブラウザ/GASの正本はネイティブsandboxへ移さない。','既存の実行環境を変更しない。非機密fixtureで拒否される操作と成功する検証を対にして確認できる時だけ評価する。','https://github.blog/changelog/2026-09-23-local-sandboxing-in-the-github-copilot-app/','https://www.youtube.com/watch?v=hS5S3dEx3Wg','テックニュース@ATI'],
    ['copilot-pr-review-times','Copilot利用計測のPR待ち時間は、個人評価でなく工程の詰まりを見る','2026-09-25','GitHub Copilot','Operational metrics','GitHubはCopilot usage metrics APIに、ready for reviewからfirst review、final review、mergeまでの中央値とp90を追加した。対象は人間が作成・レビューしたPRで、Copilotやbotのレビューは計時対象から除外され、過去分は補完されない。','計測値を個人の生産性評価へ直結させると、レビュー品質や例外対応を損なう。中央値とp90を工程の詰まりの観測として扱い、本文・個人情報・未公開差分を収集しない境界が必要である。','Issue→実装→テスト→人間レビュー→マージの状態を分け、匿名化された集計と成果物検証で改善を判断する。外部指標がなくてもローカルの完了・失敗・再試行記録を正本として残す。','現在の手作業レビューを置換しない。計測を使う場合は閲覧権限、保持期間、解釈の限界を先に決め、個人の評価には使わない。','https://github.blog/changelog/2026-09-25-usage-metrics-api-adds-pull-request-review-stages/','https://www.youtube.com/watch?v=hqSVqYk_Ay0','テックニュース@ATI'] ]},
  { issue:'2026-10-04', start:'2026-09-28', end:'2026-10-04', lead:'常時動くAIほど、権限・証跡・停止条件を先に固定する。', intro:'YouTubeのRSS候補94本を発見経路として収集し、対象週に公開された公式一次情報を7件再照合した。モデルの費用対効果、常時エージェント、拡張機構、学習・推論の安全性を、後継担当者が復旧できる運用、データ境界、ブラウザ/GASで完結する業務ロジック、ネイティブ依存の境界で評価する。図解は各記事の因果・手順・責務境界を対象とし、PNGが使えない場合も記事内のアクセシブルなSVGを最終成果物として維持する。', candidateCount:94, diagram:'youtube-pipeline', articles:[
    ['openai-safety-cases','安全ケースは、実行前の根拠・停止・復旧をひとつの証跡にする','2026-09-28','OpenAI','Safety operations','OpenAIはfrontier RL学習の継続前に、リスクへの構造化された根拠として安全ケースを整備する考え方を提示した。技術面ではalignment・containment・monitoring、運用面では異議、承認、停止、監査、ロールバックを挙げる。','安全機構が存在するだけでは、危険な実行を止められるとはいえない。開始条件、監視、担当者、停止、復旧を同じ記録で追えなければ、後継者は安全判断を再現できない。','GASやブラウザの処理は、入力検証、read-only既定、書込み承認、実行ログ、停止・復旧の状態を分ける。ネイティブ補助は小さなアダプターに閉じ、正本と業務ロジックを移さない。','安全ケースを自動承認の根拠にしない。小さな非機密fixtureで、拒否・停止・復旧の各経路を観測できる仕事から適用する。','https://openai.com/index/towards-safety-cases-for-frontier-ai-training/','https://www.youtube.com/watch?v=Xi6b2fuRM-U','テックニュース@ATI'],
    ['claude-sonnet-5-5','Claude Sonnet 5.5は、定型作業の費用と保持条件を別に選ぶ','2026-09-28','Anthropic','Model routing','AnthropicはClaude Sonnet 5.5を発表し、日常的で範囲が明確な作業、バグ修正、文書・表計算の作成に強い高速・低コストモデルとして位置づけた。Claude.aiとClaude Platform、AWS、Google Cloud、Microsoft Foundryでの提供を案内している。','速度や単価が改善しても、入力データの保持、提供経路、権限、手動復帰の条件は自動では揃わない。モデル名だけで作業を固定すると、移行と復旧の判断を失う。','調査・定型実装・高リスク検証を別キューにし、用途、入力分類、提供経路、許可ツール、出力保存先、受入試験を記録する。業務ロジックはJS/TSまたはGASに残す。','非機密かつread-onlyの代表課題で比較する。外部送信、正本更新、公開はモデルの能力にかかわらず人間承認へ残す。','https://www.anthropic.com/claude-sonnet-5-5','https://www.youtube.com/watch?v=sp7gNLljsZk','まさおAIじっくり解説ch'],
    ['gpt-6-1-sol','GPT-6.1 Solは、能力と費用を権限拡大に結びつけない','2026-09-29','OpenAI','Model routing','OpenAIはGPT-6.1 Solを、agentic coding、computer use、専門業務でGPT-6 Astraに近い性能を標準入出力価格の5分の1で提供するモデルとして発表した。ChatGPT Work、Codex、APIでの提供と、評価環境と製品環境が異なり得ることも明記した。','低コスト・高性能は、外部操作や正本更新を自動化してよい根拠ではない。評価値、実運用のツール、入力境界、承認、復旧を分けないと、費用最適化が事故の拡大につながる。','JS/TS・GAS・ブラウザの実装はモデル非依存の入力分類と受入テストを正本にし、モデルは設定で切替可能にする。実績は成功・失敗・再試行・費用を分けて保存する。','非機密のread-only評価から始める。外部書込み・公開・削除は能力評価が高くても別の確認ゲートに残す。','https://openai.com/index/introducing-gpt-6-1-sol/','https://www.youtube.com/watch?v=u5oo-41kVjk','まさおAIじっくり解説ch'],
    ['chatgpt-dots-boundary','ChatGPT Dotsは、常時実行と承認を同じものにしない','2026-09-29','OpenAI','Permission boundary','OpenAIはDotsを、専用のcloud computerと接続済みアプリで継続的な仕事を進めるalways-on agentとして発表した。読み取り専用のproactive research、Custom Rules、Activity View、影響のある操作のauto-reviewと承認を案内している。','常時動作するエージェントは、進捗を出せることと、外部状態を変えてよいことを混同しやすい。接続先、読取り、下書き、承認、送信、監査を分けなければデータ境界が崩れる。','定期調査はread-onlyで候補・証拠・差分までを作り、公開・送信・削除・共有設定は明示承認を受ける。接続アダプターは交換可能にし、業務ルールと履歴はローカル正本に残す。','接続アプリを増やさない。非機密の読み取り候補で、Activity View・拒否・停止・手動復帰を観測してから限定評価する。','https://openai.com/index/introducing-dots/','https://www.youtube.com/watch?v=pmgGMUqHQd4','まさおAIじっくり解説ch'],
    ['openai-distillation-response','推論抽出への対策は、入力だけでなく出力・経路・監査を守る','2026-09-30','OpenAI','Data boundary','OpenAIは保護された推論を抽出しようとした協調的なdistillation活動を報告し、アカウント措置、技術的制御、パートナー連携で対応した。暗号や保存会話への直接侵入ではなく、対話を操作して可視の出力から推論を再現しようとした事例として説明している。','データ境界は入力の秘匿だけでは守れない。出力、ログ、再利用可能な成果物、第三者経由の実行を含め、どの経路が情報を持ち出せるかを追跡する必要がある。','プロンプト、ツール出力、ログ、HTML成果物を別の分類として扱い、必要最小限の保存・マスキング・閲覧権限を設定する。疑わしい高頻度操作は停止し、調査用の監査証跡を残す。','利用者データの内容を収集しない。まず非機密fixtureで、出力ログの最小化、拒否、停止、調査時の復元を確認する。','https://openai.com/index/disrupting-a-coordinated-model-distillation-campaign/','https://www.youtube.com/watch?v=tO5cyadu8uA','AI時短ラボ'],
    ['claude-code-mods-boundary','Claude Modsは、深い拡張ほど検証・信頼・復旧を先に置く','2026-10-01','Anthropic','Extension governance','AnthropicのClaude Code v2.1.287は、pluginがより深い振る舞いを変更できるClaude Modsと、見落としを知らせる組込みModを追加した。公式リリースノートは、既存plugin・接続・レビューの挙動も更新している。','実行時の深い拡張は、設定ファイルの存在や単体動作だけでは安全性を示せない。変更範囲、信頼状態、受信内容、失敗時の停止、元の経路への復帰を別々に検証する必要がある。','pluginやhookは最小権限の実行アダプターとして隔離し、純粋な業務ロジックと成果物正本をJS/TS・GAS側に置く。導入前後で許可イベント、ログ、拒否、無効化・復元の試験を残す。','既存のグローバルスキルを自動変更しない。非機密fixtureで信頼・実行・無効化を観測できる小さな検証から始める。','https://github.com/anthropics/claude-code/releases/tag/v2.1.287','https://www.youtube.com/watch?v=Rqe3_KoNhy8','いまにゅのAIプログラミング塾'],
    ['gpt-6-practical-guide','GPT-6の実装ガイドは、モデル選択を検証可能な運用へ戻す','2026-10-02','OpenAI','Operational design','OpenAIはGPT-6を使う実装向けの実践ガイドを公開し、時間と費用を管理しながらモデルを使い分けることを案内した。製品一覧でも同ガイドをGPT-6 family向けの新規資料として掲載している。','ベンダーの推奨は、固有の性能・料金・提供条件が変わる前提で読む必要がある。業務ロジックまで一体化すると、移行、障害時の手動復帰、費用の再評価が難しくなる。','モデル選択を設定化し、入力分類、タイムアウト、再試行上限、成果物検証、費用観測を実装から分離する。ブラウザ/GASで完結する処理を優先し、ネイティブ依存は明示的な境界に閉じる。','公式ガイドを固定仕様として採用しない。非機密の代表タスクで品質・待ち時間・費用・失敗復旧を測ってから選ぶ。','https://openai.com/news/product-releases/','https://www.youtube.com/watch?v=4nyizo_iQmQ','テックニュース@ATI'] ]}
];

const css = `:root{color-scheme:dark;--bg:#0d0d12;--panel:#171720;--panel2:#201f2d;--panel-card:#1d1a29;--ink:#f6f4ff;--ink-secondary:#d4d0e2;--muted:#aaa8bc;--line:#353444;--line-light:#4a485c;--violet:#ba9cff;--violet-subtle:#2d2345;--cyan:#75e3ef;--cyan-subtle:#18323a;--gold:#ffd072;--gold-subtle:#3b311b;--green:#8ae5aa;--green-subtle:#1c3525;--rose:#ff929d;--rose-subtle:#3d1c24}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 90% 0%,#302052 0,transparent 38rem),var(--bg);color:var(--ink);font-family:"Yu Gothic UI","Hiragino Sans",system-ui,-apple-system,sans-serif;line-height:1.75;-webkit-font-smoothing:antialiased}a{color:#c8b7ff;text-underline-offset:3px}a:focus-visible,button:focus-visible{outline:2px solid var(--violet);outline-offset:3px}.shell{width:min(1080px,calc(100% - 32px));margin:auto}header{padding:clamp(40px,7vw,64px) 0 32px;border-bottom:1px solid var(--line)}.eyebrow,.section-label{color:var(--cyan);font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{max-width:850px;margin:.3rem 0 .8rem;font-size:clamp(2rem,6vw,4rem);line-height:1.15;letter-spacing:-.03em}.lead{max-width:780px;color:#d0cddd;font-size:clamp(1rem,2vw,1.15rem);line-height:1.7}.meta,.feedback-buttons,.source-links{display:flex;flex-wrap:wrap;gap:8px}.pill,.tag{display:inline-flex;align-items:center;padding:4px 11px;border:1px solid var(--line);border-radius:999px;color:#d4d1df;font-size:.76rem;font-weight:600}.toolbar{display:flex;justify-content:space-between;gap:16px;align-items:center;margin:26px 0;padding:15px 18px;border:1px solid var(--line);border-radius:16px;background:#13131bf0;position:sticky;top:10px;z-index:30;backdrop-filter:blur(12px);box-shadow:0 8px 30px #00000040}.toolbar small,.date{color:var(--muted)}.export{min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:11px;padding:10px 18px;background:var(--violet);color:#1b102b;font-weight:800;font-size:.9rem;cursor:pointer;transition:transform .15s ease,opacity .15s ease}.export:hover{opacity:.92;transform:translateY(-1px)}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:30px 0 42px}.summary-card{padding:20px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#242133,#15151d);box-shadow:0 6px 20px #00000028}.summary-card strong{display:block;font-size:clamp(1.6rem,3vw,2rem);letter-spacing:-.02em;margin-bottom:2px}.summary-card span{color:var(--muted);font-size:.84rem;font-weight:500}.section-label{margin:40px 0 12px;color:var(--gold)}article{margin-bottom:28px;padding:clamp(20px,4vw,34px);border:1px solid var(--line);border-radius:24px;background:linear-gradient(150deg,var(--panel),#111118);box-shadow:0 18px 50px #00000045}.article-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.article-head>div:first-child{flex:1;min-width:0}.rank{min-width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:var(--violet-subtle);color:var(--violet);font-weight:900;font-size:1.05rem;flex-shrink:0}h2{margin:.45rem 0 .55rem;font-size:clamp(1.3rem,2.5vw,1.85rem);line-height:1.35;letter-spacing:-.01em}.take{margin:18px 0 16px;padding:15px 18px;border-left:4px solid var(--violet);background:#221c31;border-radius:0 14px 14px 0;color:#f0ecfc;font-size:clamp(.94rem,1.5vw,1rem);line-height:1.75}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}.note{padding:16px 18px;border:1px solid var(--line);border-radius:14px;background:#121219}.note h3{margin:0 0 6px;color:var(--cyan);font-size:.84rem;font-weight:800;letter-spacing:.03em}.note p{margin:0;color:#cfccda;font-size:.94rem;line-height:1.7}.decision{margin:16px 0;padding:10px 14px;background:var(--green-subtle);border-left:3px solid var(--green);border-radius:0 10px 10px 0;color:var(--green);font-weight:800;font-size:.95rem;line-height:1.6}.knowledge-relevance{margin:20px 0 16px;padding:18px 20px;border:1px solid #4a3e2c;border-left:4px solid var(--gold);border-radius:0 16px 16px 0;background:#1c1815}.knowledge-relevance h3{margin:0 0 10px;color:var(--gold);font-size:.9rem;font-weight:800}.knowledge-delta{margin:0 0 12px;padding:6px 10px;border-radius:8px;background:#2d2417;color:#f0ddb8;font-size:.84rem;font-weight:600}.knowledge-empty{margin:0;color:#d8d2c4;font-size:.92rem;line-height:1.7}.knowledge-unregistered{border-color:#3e4559;border-left-color:var(--cyan);background:#141922}.knowledge-unregistered h3{color:var(--cyan)}.knowledge-relevance ul{margin:0;padding-left:18px;color:#d8d2c4}.knowledge-relevance li{margin-bottom:12px}.knowledge-relevance li:last-child{margin-bottom:0}.knowledge-status{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#253729;color:var(--green);font-size:.7rem;font-weight:800}.knowledge-sources{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.knowledge-source{font-size:.78rem;font-weight:700}.source-links{align-items:center;margin-top:16px;padding-top:14px;border-top:1px dashed var(--line);gap:12px}.source-link,.discovery-link{display:inline-flex;align-items:center;min-height:38px;padding:6px 14px;border-radius:999px;font-weight:700;text-decoration:none;transition:all .15s ease}.source-link{border:1px solid var(--line-light);background:#221f2f;color:var(--ink)}.source-link:hover{border-color:var(--violet);background:#2c273e}.discovery-link{font-size:.85rem;color:var(--cyan);background:#162428;border:1px solid #28444a}.discovery-link:hover{border-color:var(--cyan)}.diagram{margin:24px 0;padding:22px;border:1px solid var(--line);border-radius:20px;background:#101018;overflow-x:auto}.diagram figcaption{margin-top:12px;color:var(--muted);font-size:.84rem;line-height:1.6}.diagram svg{display:block;width:100%;min-width:760px;height:auto}.diagram svg text{font-family:"Yu Gothic UI","Hiragino Sans",system-ui,-apple-system,sans-serif}.diag-card{fill:#171622;stroke:#353447;stroke-width:1.5}.diag-card-highlight{fill:#201a30;stroke:#6c528f;stroke-width:1.5}.diag-card-success{fill:#14231b;stroke:#3d7251;stroke-width:1.5}.diag-badge-default{fill:#232130;stroke:#444159;stroke-width:1}.diag-badge-cyan{fill:#14272e;stroke:#275662;stroke-width:1}.diag-badge-violet{fill:#261d36;stroke:#584379;stroke-width:1}.diag-badge-gold{fill:#2b2216;stroke:#614d28;stroke-width:1}.diag-badge-green{fill:#15281b;stroke:#2b5e39;stroke-width:1}.diag-tag-bg{fill:#12121b}.diag-tag-highlight-bg{fill:#191426}.diag-tag-success-bg{fill:#0f1c15}.diag-text-title{fill:#f6f4ff;font-size:14.5px;font-weight:700}.diag-text-success-title{fill:#8ae5aa}.diag-text-sub{fill:#aaa8bc;font-size:11.5px;font-weight:500}.diag-text-micro{fill:#8e8b9e;font-size:10.5px;font-weight:600}.diag-text-micro-gold{fill:#ffd072}.diag-text-micro-green{fill:#8ae5aa}.diag-text-badge{font-size:11px;font-weight:800;letter-spacing:.04em}.diag-text-badge-default{fill:#d4d0e2}.diag-text-badge-cyan{fill:#75e3ef}.diag-text-badge-violet{fill:#ba9cff}.diag-text-badge-gold{fill:#ffd072}.diag-text-badge-green{fill:#8ae5aa}.diag-line-flow{stroke:#70577f;stroke-width:2}.diag-line-green{stroke:#3d8a5c;stroke-width:2}.diag-line-violet{stroke:#ba9cff;stroke-width:2}.diag-marker{fill:#70577f}.diag-marker-success{fill:#3d8a5c}.diag-marker-violet{fill:#ba9cff}.diag-icon-stroke-cyan{stroke:#75e3ef;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none}.diag-icon-stroke-violet{stroke:#ba9cff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none}.diag-icon-stroke-gold{stroke:#ffd072;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none}.diag-icon-stroke-green{stroke:#8ae5aa;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none}.recheck-radar{margin:54px 0 28px;padding:clamp(20px,4vw,32px);border:1px solid var(--violet);border-radius:26px;background:linear-gradient(145deg,#20182c,#111118);box-shadow:0 18px 50px #00000050}.recheck-kicker{color:var(--cyan);font-size:.76rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.recheck-radar>h2{margin:.35rem 0}.recheck-intro{margin:0 0 20px;color:var(--muted);font-size:.95rem;line-height:1.7}.recheck-card{margin:0;background:#111118;box-shadow:none;border-color:transparent;padding:0}.recheck-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.recheck-item{padding:18px;border:1px solid var(--line);border-radius:16px;background:#171720}.recheck-item h3{margin:.35rem 0 .65rem;font-size:1.05rem;line-height:1.4}.recheck-item p{margin:.5rem 0;font-size:.92rem;line-height:1.65}.recheck-status{display:inline-flex;padding:3px 10px;border-radius:999px;background:#23392b;color:var(--green);font-size:.72rem;font-weight:900}.recheck-empty-rule{margin:18px 0 0;color:var(--muted);font-size:.82rem}.recheck-none{margin:0;padding:16px 18px;border:1px dashed var(--line-light);border-radius:14px;background:#12121b;color:var(--ink-secondary);font-size:.92rem;line-height:1.7}.feedback{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}.feedback-title{margin:0 0 10px;color:var(--muted);font-size:.82rem;font-weight:600}.feedback-buttons{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}.feedback button{min-height:44px;padding:10px 14px;border:1px solid #4b485e;border-radius:12px;background:#201e2a;color:#e1ddeb;font-size:.88rem;font-weight:700;cursor:pointer;transition:all .15s ease}.feedback button:hover{background:#2b2838;border-color:#65607e}.feedback button.is-active{background:#574178;border-color:var(--violet);color:#fff}.feedback button[data-feedback="dismiss"].is-active{background:#6a3038;border-color:var(--rose);color:#fff}.empty-signal{margin:32px 0;padding:24px;border:1px dashed #57536c;border-radius:20px;background:#15151d;color:#cbc8d5}.empty-signal h2{margin-top:0}footer{margin-top:52px;padding:28px 0 52px;border-top:1px solid var(--line);color:var(--muted);font-size:.84rem;line-height:1.7}@media(max-width:700px){.summary-grid,.two-col{grid-template-columns:1fr}.article-head{flex-direction:column-reverse;align-items:flex-start;gap:10px}.rank{margin-bottom:4px}.toolbar{position:static;flex-direction:column;align-items:stretch;text-align:left}.export{width:100%}.feedback-buttons{grid-template-columns:repeat(2,1fr)}}@media print{body{background:#fff!important;color:#111!important}article,.summary-card,.empty-signal,.note,.take,.recheck-radar,.recheck-item,.work-relevance,.issue-card{background:#fff!important;color:#111!important;box-shadow:none!important;border-color:#ccc!important;break-inside:avoid;page-break-inside:avoid}article{margin-bottom:20px}a{color:#111!important;text-decoration:underline}.source-link::after{content:" (" attr(href) ")";font-size:.75em;font-weight:400;word-break:break-all}.discovery-link::after{content:" (" attr(href) ")";font-size:.75em;font-weight:400;word-break:break-all}.toolbar,.feedback{display:none!important}}`;

function normalizeArticle(issueId, rawArticle, pageStatus = 'generated') {
  const [articleId, title, date, tag1, tag2, fact, impact, cross, decision, url, discoveryUrl, discoveryLabel, knowledgeIds, knowledgeDelta] = rawArticle;
  return {
    issue: issueId,
    pageStatus,
    articleId,
    title,
    date,
    tag1,
    tag2,
    fact,
    impact,
    cross,
    decision,
    url,
    discoveryUrl,
    discoveryLabel,
    knowledgeIds: resolveArticleKnowledge(articleId, knowledgeIds),
    knowledgeDelta: knowledgeDelta ?? '',
  };
}

function materializeIssue(issue, pageStatus = 'generated') {
  if (issue.candidateCount !== undefined) {
    validateWeeklySelection({
      issue: issue.issue,
      candidateCount: issue.candidateCount,
      articleCount: issue.articles.length,
      exception: issue.selectionException,
    });
  }
  return {
    ...issue,
    pageStatus,
    articles: issue.articles.map((article) => normalizeArticle(issue.issue, article, pageStatus)),
  };
}

function materializeProvisionalIssue(issue) {
  return {
    ...issue,
    pageStatus: 'provisional',
    articles: issue.articleIds.map((articleId) => ({
      issue: issue.issue,
      pageStatus: 'provisional',
      articleId,
      title: null,
      knowledgeIds: resolveArticleKnowledge(articleId, []),
      knowledgeDelta: '',
    })),
  };
}

function article(a, i) {
  const discovery = a.discoveryUrl ? `<a class="discovery-link" href="${a.discoveryUrl}" target="_blank" rel="noreferrer">発見元YouTube：${a.discoveryLabel} →</a>` : '';
  return `<div class="section-label">Signal ${String(i + 1).padStart(2, '0')}</div><article data-article-id="${a.articleId}"><div class="article-head"><div><div class="meta"><span class="tag">${a.tag1}</span><span class="tag">${a.tag2}</span></div><h2>${a.title}</h2><div class="date">${a.date} JST</div></div><div class="rank">${String(i + 1).padStart(2, '0')}</div></div><p class="take">${a.fact}</p><div class="two-col"><div class="note"><h3>開発方針への影響</h3><p>${a.impact}</p></div><div class="note"><h3>横断アイデア</h3><p>${a.cross}</p></div></div><p class="decision">判断：${a.decision}</p>${knowledgeBlock(a.knowledgeIds, a.knowledgeDelta)}<div class="source-links"><a class="source-link" href="${a.url}" target="_blank" rel="noreferrer">公式一次情報を読む →</a>${discovery}</div><div class="feedback"><p class="feedback-title">この記事へのフィードバック（複数選択可）</p><div class="feedback-buttons"><button type="button" data-feedback="important" aria-pressed="false">重要</button><button type="button" data-feedback="try" aria-pressed="false">試したい</button><button type="button" data-feedback="watch" aria-pressed="false">継続監視</button><button type="button" data-feedback="dismiss" aria-pressed="false">不要</button></div></div></article>`;
}
// 再判定項目は号定義が持つ「データ」で、HTML はここで組み立てる（芯と殻を分ける）。
// items が空配列 = 公式一次情報を確認したが判断を変える更新が無かった週。
// 号定義に recheck が無い = まだ確認していない週。両者を出力で区別する。
export function recheckItem(item){
  const fields=item.fields.map(([label,value])=>`<p><strong>${label}：</strong>${value}</p>`).join('');
  const links=item.links.map(([label,url])=>`<a class="${label.startsWith('発見元YouTube')?'discovery-link':'source-link'}" href="${url}" target="_blank" rel="noreferrer">${label} →</a>`).join('');
  const harness=item.harness?.length?`<p class="recheck-harness"><strong>対象：</strong>${item.harness.map((h)=>`<code>${h}</code>`).join(', ')}</p>`:'';
  return `<div class="recheck-item"><span class="recheck-status">${item.status}</span><h3>${item.title}</h3>${harness}${fields}<div class="source-links">${links}</div></div>`;
}
export function recheckRadar(items, issue){
  const v2=isHarnessProposalIssue(issue);
  const none=v2?'今週、ハーネスに効く更新なし。公式一次情報は確認済みで、該当が無かったことを記録する。':'今週、判断を変える更新なし。公式一次情報は確認済みで、該当が無かったことを記録する。';
  const heading=recheckSectionLabel(issue);
  const intro=v2?'公式のバグ修正・新機能・既定値の変更を材料に、いまのハーネスをどう変えると良くなるかを、裏取り付きで提案する独立枠。':'新機能の紹介ではなく、僕らAIが以前に出した「不可・複雑・保留」を、今週の道具と公式情報で再判定する独立枠。';
  const emptyRule=v2?'該当がない週は水増しせず、「今週、ハーネスに効く更新なし」と記録する。':'該当がない週は水増しせず、「今週、判断を変える更新なし」と記録する。';
  const fbTitle=v2?'このハーネス改善提案枠へのフィードバック（複数選択可）':'この再判定枠へのフィードバック（複数選択可）';
  const body=items.length
    ?`<div class="recheck-grid">${items.map(recheckItem).join('')}</div>`
    :`<p class="recheck-none" data-recheck="confirmed-none">${none}</p>`;
  return `<section class="recheck-radar" aria-labelledby="ai-recheck-title"><div class="recheck-kicker">Recovery harness for AI</div><article class="recheck-card" data-article-id="ai-self-update-recheck"><h2 id="ai-recheck-title">${heading}</h2><p class="recheck-intro">${intro}</p>${body}<p class="recheck-empty-rule">${emptyRule}</p><div class="feedback"><p class="feedback-title">${fbTitle}</p><div class="feedback-buttons"><button type="button" data-feedback="important" aria-pressed="false">重要</button><button type="button" data-feedback="try" aria-pressed="false">試したい</button><button type="button" data-feedback="watch" aria-pressed="false">継続監視</button><button type="button" data-feedback="dismiss" aria-pressed="false">不要</button></div></div></article></section>`;
}
const youtubePipelineDiagram=`<figure class="diagram"><svg viewBox="0 0 960 210" role="img" aria-labelledby="youtube-pipeline-title youtube-pipeline-desc"><title id="youtube-pipeline-title">YouTubeから採用記事までの確認経路</title><desc id="youtube-pipeline-desc">19チャンネルのRSSから候補を集め、有望動画だけ字幕を確認し、公式一次情報へ照合して既存案件へ接続する。</desc><defs><marker id="pipe-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" class="diag-marker"/></marker><marker id="pipe-arrow-success" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" class="diag-marker-success"/></marker></defs><g class="diag-group"><rect x="20" y="24" width="210" height="162" rx="14" class="diag-card"/><rect x="34" y="38" width="76" height="22" rx="6" class="diag-badge-default"/><text x="72" y="53" text-anchor="middle" class="diag-text-badge diag-text-badge-default">01 収集</text><text x="34" y="90" class="diag-text-title">19チャンネルRSS</text><text x="34" y="118" class="diag-text-sub">直近7日の動画を自動取得</text><text x="34" y="138" class="diag-text-sub">週70本以上の公開差分を</text><text x="34" y="158" class="diag-text-sub">取りこぼしなく機械観測</text></g><line x1="230" y1="105" x2="256" y2="105" class="diag-line-flow" marker-end="url(#pipe-arrow)"/><g class="diag-group"><rect x="260" y="24" width="210" height="162" rx="14" class="diag-card"/><rect x="274" y="38" width="94" height="22" rx="6" class="diag-badge-cyan"/><text x="321" y="53" text-anchor="middle" class="diag-text-badge diag-text-badge-cyan">02 スクリーニング</text><text x="274" y="90" class="diag-text-title">有望動画の字幕確認</text><text x="274" y="118" class="diag-text-sub">実演・機能発表があるか検証</text><text x="274" y="138" class="diag-text-sub">単なる感想・煽りタイトルを</text><text x="274" y="158" class="diag-text-sub">内容ベースでフィルタ</text></g><line x1="470" y1="105" x2="496" y2="105" class="diag-line-flow" marker-end="url(#pipe-arrow)"/><g class="diag-group"><rect x="500" y="24" width="210" height="162" rx="14" class="diag-card-highlight"/><rect x="514" y="38" width="80" height="22" rx="6" class="diag-badge-violet"/><text x="554" y="53" text-anchor="middle" class="diag-text-badge diag-text-badge-violet">03 原典照合</text><text x="514" y="90" class="diag-text-title">公式一次情報へ再照合</text><text x="514" y="118" class="diag-text-sub">公式Release・Changelogを探索</text><text x="514" y="138" class="diag-text-sub">動画の主張が事実か確認</text><text x="514" y="158" class="diag-text-sub">一次ソースのURLを特定</text></g><line x1="710" y1="105" x2="736" y2="105" class="diag-line-green" marker-end="url(#pipe-arrow-success)"/><g class="diag-group"><rect x="740" y="24" width="200" height="162" rx="14" class="diag-card-success"/><rect x="754" y="38" width="76" height="22" rx="6" class="diag-badge-green"/><text x="792" y="53" text-anchor="middle" class="diag-text-badge diag-text-badge-green">04 知識化</text><text x="754" y="90" class="diag-text-title diag-text-success-title">記事・既存案件接続</text><text x="754" y="118" class="diag-text-sub">発見元と公式URLを分離表示</text><text x="754" y="138" class="diag-text-sub">Linear案件への影響判定</text><text x="754" y="158" class="diag-text-sub">HTML正本へ永続記録</text></g></svg><figcaption>動画は発見経路。字幕も最終根拠にせず、公式資料で確認できた主張だけを記事へ残す。</figcaption></figure>`;
function script(x){return `<script>(()=>{'use strict';const storageKey='p-p-TechNews:${x.issue}',issueDate='${x.issue}',period={start:'${x.start}',end:'${x.end}'},articles=[...document.querySelectorAll('article[data-article-id]')],summary=document.querySelector('#feedback-summary');let state={};try{state=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{state={}}const selections=id=>Array.isArray(state[id])?state[id]:[];function render(){let n=0;for(const article of articles){const s=selections(article.dataset.articleId);if(s.length)n++;for(const button of article.querySelectorAll('[data-feedback]')){const active=s.includes(button.dataset.feedback);button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))}}summary.textContent=\`選択済み \${n} / \${articles.length} 項目\`}function save(){try{localStorage.setItem(storageKey,JSON.stringify(state))}catch{summary.textContent='保存できません。JSONを書き出してください。'}}document.addEventListener('click',event=>{const button=event.target.closest('button[data-feedback]');if(!button)return;const id=button.closest('article').dataset.articleId,value=button.dataset.feedback,current=new Set(selections(id));if(value==='dismiss')state[id]=current.has('dismiss')?[]:['dismiss'];else{current.delete('dismiss');current.has(value)?current.delete(value):current.add(value);state[id]=[...current]}if(!state[id].length)delete state[id];save();render()});document.querySelector('#export-feedback').addEventListener('click',()=>{const feedback=articles.map(article=>({articleId:article.dataset.articleId,title:article.querySelector('h2').textContent.trim(),selections:selections(article.dataset.articleId)})),payload={schemaVersion:1,issueDate,period,exportedAt:new Date().toISOString(),feedback},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=Object.assign(document.createElement('a'),{href:url,download:'technews-feedback-${x.issue}.json'});anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});render()})();</script>`}
function page(x){const count=x.articles.length,recheckItems=recheckByIssue.get(x.issue),feedbackCount=count+(recheckItems?1:0);const diagram=x.diagram==='youtube-pipeline'?youtubePipelineDiagram:'',recheck=recheckItems?recheckRadar(recheckItems,x.issue):'';return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TechNews Weekly — ${x.issue}</title><style>${css}</style></head><body><header><div class="shell"><div class="eyebrow">Cross-platform technology radar</div><h1>${x.lead}</h1><p class="lead">${x.intro}</p><div class="meta"><span class="pill">${x.start} – ${x.end}</span><span class="pill">一次情報 ${count}件</span><span class="pill">試作・過去号</span></div></div></header><main class="shell" data-issue-date="${x.issue}" data-period-start="${x.start}" data-period-end="${x.end}"><div class="toolbar"><div><strong>あなたの反応を次号の選定基準へ</strong><br><small id="feedback-summary" aria-live="polite">選択済み 0 / ${feedbackCount} 項目</small></div><button class="export" id="export-feedback" type="button">feedback.jsonを書き出す</button></div><section class="summary-grid"><div class="summary-card"><strong>${count}</strong><span>採用した一次情報</span></div><div class="summary-card"><strong>一次</strong><span>公式情報へ再照合</span></div><div class="summary-card"><strong>Local</strong><span>反応はブラウザ内保存</span></div></section>${diagram}${x.articles.map((entry,index)=>article(entry,index)).join('')}${recheck}${x.empty?'<section class="empty-signal"><h2>ほかに有意な更新なし</h2><p>対象期間内の公式一次情報を確認したが、現在の判断を変える強い更新は見つからなかった。予定日や更新日の曖昧な記事で紙面を埋めず、確認後の少数として残す。</p></section>':''}</main><footer><div class="shell">TechNews trial · 公式一次情報へ${x.issue}に再照合。フィードバックはこのブラウザ内だけに保存され、JSON書き出しまで外部送信されません。 · <a href="index.html">全号一覧</a> · <a href="knowledge/AI_SEARCH.md">AI検索入口</a></div></footer>${script(x)}</body></html>`}


const diagramAltText={
  'search-ai-controls':'出典の鎖：発見入口から公式資料への再照合、構造化、追跡可能なHTML正本までの4段階',
  'sheets-formula-repair':'AI数式修復の検算ループ：候補式、差分、再計算、人間承認の流れ',
  'copilot-byok':'AIフロントとモデル供給元の分離：データ分類、許可プロバイダー、キー管理、承認の境界',
  'npm-staged-controls':'依存パッケージの供給網ゲート：許可元、検証、公開、ロールバックの流れ',
  'workspace-may-drops':'WorkspaceのAI・自動化と、JSON・HTML・PDFの独立成果物層を分ける構成',
  'workspace-studio-layered-protection':'Workspace Studioの多層保護：最小権限、監査、緊急停止の境界',
  'chatgpt-work-signed-in-browser':'ログイン済みサイト自動作業：資格情報の隠蔽、作業権限の段階分離、人間による直前確認と停止の境界',
  'webmcp-imperative-api-2026-08-20':'WebMCP 道具公開：同一オリジン保護、型付き最小道具の公開、動的登録解除と通常UI退避の多層境界',
  'chatgpt-work-webhooks':'定期タスク自動化：不要ポーリングの脱却、下書きと独立コピー、人間承認と外部実行の境界',
  'temporary-chat-control-boundary':'一時チャットの境界管理：非パーソナライズ探索、検証と結論の抽出、通常タスク・正本への昇格',
  'multiple-google-account-boundary':'複数アカウント接続：用途別の明示的台帳、Read-only既定の探索、書込み対象の明示的確認',
  'microsoft-agentic-containment':'Agentic Containment：攻撃面強化と権限統制、実行時影響範囲の制限、常時可視化と緊急遮断',
  'cursor-origin-code-hosting':'AI向けコードホスティング：マクロ台帳の分離、成果物正本と同期境界、交換可能なAgent実行基盤',
  'youtube-gpt-token-efficiency':'モデル選定の評価軸：タスク難度に応じた階層、成果物テストと昇格判定、総トークンと成功率の測定',
  'youtube-webmcp':'WebMCP：脆弱な画面操作から型付きブラウザツールへの進化と共通業務ロジックの再利用',
  'youtube-workspace-video-manuals':'手順書自動化：実作業メモ・スクショ収集、構造化手順正本、編集可能スライド・HTMLの多面展開',
  'youtube-claude-hooks-html':'Hooks自動化：保存時イベント検知、軽量ランナーによる自動変換、ローカルとクラウドの責務分担',
  'youtube-npm-supply-chain':'サプライチェーン防衛：署名過信の排除、段階的公開と取得元制御、リリース台帳とロールバック',
  'github-code-quality':'AI生成コード品質ゲート：生成速度への追従、独立セキュリティ検査、人間承認とマージ前ブロッキングの境界',
  'sheets-comments-api':'Sheetsコメント境界：構造データ正本の保持、コメントを可逆レビュー面へ限定、承認状態同期の分離設計',
  'github-mcp-stateless':'Stateless MCP連携：セッションストア除去による復旧性向上と、認証・権限・監査境界の堅持',
  'copilot-linear-ga':'Linear・Copilot連携境界：マクロ台帳と成果物の分離、Agent権限のDraft PR限定、人間によるマージ判断',
  'sheets-mcp-preview':'Sheets MCP操作面境界：構造JSON正本の保持、Sheetsを交換可能な入出力adapterに限定し、read-onlyからの段階検証',
  'ai-security-detections':'AIセキュリティ二層検出：CodeQL決定的検査を主軸に、AI検出をmerge非ブロッキングの補助層として置く多層防御',
  'pr-archive':'PR可逆アーカイブ境界：不可逆削除を廃し、公開ビューからの退避と安全な復元経路を備えた状態遷移設計',
  'setup-java-5-5':'CI供給網署名検証：配布元・検証鍵・完全SHA固定を明示し、取得から成果物まで暗黙依存を排除する検証工程',
  'gpt-5-6-family':'モデル階層ルーティング境界：作業難度と費用に応じた多層委任、共通テストによる品質保証と交換可能性設計',
  'chrome-150':'OSテーマ統合境界：AccentColor等のCSS標準採用と、帳票印刷・実機表示フォールバックの視覚分離検証',
  'workspace-mdm-ou':'OU組織単位権限委譲境界：広域管理者を排し、部門単位の最小権限・監査ログ・復旧手順を紐付ける安全管理設計',
  'github-models-retirement':'外部AI基盤終了・撤退設計：交換インターフェース、データexport、手動経路およびAI依存台帳による撤退管理',
  'node-24-18':'Node.js LTS更新検証境界：暗号仕様・NSS証明書・Buffer更新に伴う互換性破壊を検知する共通回帰試験設計',
  'gemini-classroom-boundary':'Workspace外部連携統制境界：既定有効化状態、データ保存地域、テナント境界とデータプライバシーの事前確認設計',
  'deno-2-9-5':'Web標準ランタイム境界：Blob/Body.textStream等の標準ストリーム採用と実験的機能の段階評価設計',
  'agents-python-0-19-4':'エージェント障害境界：guardrail・引数エラー秘匿・並行処理キャンセル・token予算の多層制御設計',
  'uv-0-12-3':'一回処理Python境界：CPython固定・workspaceメタデータ・配布ハッシュ検証による常設基盤化防止設計',
  'electron-43-3-0':'デスクトップ化境界：異DPI対応・ASAR一時ファイル管理・クラッシュ復旧の受入試験設計',
  'langchainjs-local-file-store':'ローカル永続化境界：相対キー解決・保存先明示・復元テストによるポータビリティ設計',
  'npm-publish-scan':'npm公開パイプライン境界：マルウェア検査・審査保留・ブロックによる公開中間状態の管理設計',
  'github-actions-approval':'CI実行権限境界：外部workflow保留・write権限者による人間承認・秘密情報保護の安全設計',
  'copilot-managed-settings':'AI横断ポリシー境界：managed-settingsによるプラグイン・モデル・承認バイパスの一括統制設計',
  'node-security-july-2026':'ランタイム脆弱性境界：Permission Model・TLS・SQLite書込み再実行の回帰試験とバージョン管理設計'
};
async function readCompressedManifest(rootUrl = new URL('./', import.meta.url)) {
  try {
    return JSON.parse(await readFile(new URL('./assets/diagrams/compressed/manifest.json', rootUrl), 'utf8'));
  } catch (error) {
    throw new Error('missing compressed infographic PNG manifest', { cause: error });
  }
}

export async function collectCliInfographicFigures({ rootUrl = new URL('./', import.meta.url), diagramAltText: overrideAltText } = {}) {
  const diagramAltMap = overrideAltText ?? diagramAltText;
  const manifest = await readCompressedManifest(rootUrl);
  const compressedById = new Map((manifest.images ?? []).map((entry) => [entry.diagramId, entry]));
  const cliInfographicFigures = Object.fromEntries(await Promise.all(Object.entries(diagramAltMap).map(async ([id, alt]) => {
    const entry = compressedById.get(id);
    if (!entry) throw new Error(`missing compressed infographic PNG for ${id}`);
    const imageUrl = new URL(entry.compressedPath, rootUrl);
    return [id, await buildEmbeddedImageFigure({ alt, imageUrl })];
  })));
  const generatedDiagramIds = (manifest.images ?? []).map((entry) => entry.diagramId).filter(Boolean);

  for (const id of generatedDiagramIds) {
    if (id in cliInfographicFigures) continue;
    const entry = compressedById.get(id);
    if (!entry) continue;
    const imageUrl = new URL(entry.compressedPath, rootUrl);
    cliInfographicFigures[id] = await buildEmbeddedImageFigure({
      alt: `${id}の記事テーマを整理した図解`,
      imageUrl,
    });
  }

  return { cliInfographicFigures, generatedDiagramIds };
}
const articleDiagrams={
  'chrome-speed-records':`<figure class="diagram article-diagram"><svg viewBox="0 0 940 240" role="img" aria-labelledby="perf-title perf-desc"><title id="perf-title">処理ボトルネックの切り分け</title><desc id="perf-desc">実操作を測定し、ブラウザで足りる処理と外へ分離する処理を切り分ける。</desc><defs><marker id="perf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" class="diag-marker"/></marker><marker id="perf-arrow-success" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" class="diag-marker-success"/></marker><marker id="perf-arrow-violet" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" class="diag-marker-violet"/></marker></defs><g class="diag-group"><rect x="20" y="30" width="190" height="180" rx="14" class="diag-card"/><rect x="34" y="44" width="72" height="22" rx="6" class="diag-badge-default"/><text x="70" y="59" text-anchor="middle" class="diag-text-badge diag-text-badge-default">STEP 01</text><circle cx="170" cy="55" r="14" class="diag-badge-cyan"/><path d="M162 59 A10 10 0 1 1 178 59" class="diag-icon-stroke-cyan"/><line x1="170" y1="55" x2="175" y2="48" class="diag-icon-stroke-cyan"/><text x="34" y="98" class="diag-text-title">実データ・実操作</text><text x="34" y="128" class="diag-text-sub">合成ベンチマークより</text><text x="34" y="148" class="diag-text-sub">実画面のレンダリングや</text><text x="34" y="168" class="diag-text-sub">実データ操作で計測</text><rect x="34" y="184" width="162" height="16" rx="4" class="diag-tag-bg"/><text x="115" y="196" text-anchor="middle" class="diag-text-micro">測定基準を固定</text></g><line x1="210" y1="120" x2="246" y2="120" class="diag-line-flow" marker-end="url(#perf-arrow)"/><g class="diag-group"><rect x="250" y="30" width="190" height="180" rx="14" class="diag-card"/><rect x="264" y="44" width="72" height="22" rx="6" class="diag-badge-cyan"/><text x="300" y="59" text-anchor="middle" class="diag-text-badge diag-text-badge-cyan">STEP 02</text><circle cx="400" cy="55" r="14" class="diag-badge-cyan"/><line x1="393" y1="62" x2="393" y2="52" class="diag-icon-stroke-cyan"/><line x1="398" y1="62" x2="398" y2="46" class="diag-icon-stroke-cyan"/><line x1="403" y1="62" x2="403" y2="56" class="diag-icon-stroke-cyan"/><line x1="408" y1="62" x2="408" y2="50" class="diag-icon-stroke-cyan"/><text x="264" y="98" class="diag-text-title">ボトルネック特定</text><text x="264" y="128" class="diag-text-sub">DOM再構築／レイアウト</text><text x="264" y="148" class="diag-text-sub">計算負荷・メモリ保持など</text><text x="264" y="168" class="diag-text-sub">遅延の真因をプロファイル</text><rect x="264" y="184" width="162" height="16" rx="4" class="diag-tag-bg"/><text x="345" y="196" text-anchor="middle" class="diag-text-micro">要因を切り分け</text></g><line x1="440" y1="120" x2="476" y2="120" class="diag-line-flow" marker-end="url(#perf-arrow)"/><g class="diag-group"><rect x="480" y="30" width="190" height="180" rx="14" class="diag-card-highlight"/><rect x="494" y="44" width="82" height="22" rx="6" class="diag-badge-gold"/><text x="535" y="59" text-anchor="middle" class="diag-text-badge diag-text-badge-gold">DECISION</text><polygon points="630,43 642,55 630,67 618,55" class="diag-badge-gold" stroke-width="1.5"/><text x="494" y="98" class="diag-text-title">ブラウザで足りる？</text><text x="494" y="128" class="diag-text-sub">60fpsを維持できるか？</text><text x="494" y="148" class="diag-text-sub">UIスレッドを塞がずに</text><text x="494" y="168" class="diag-text-sub">同期処理が可能か？</text><rect x="494" y="184" width="162" height="16" rx="4" class="diag-tag-highlight-bg"/><text x="575" y="196" text-anchor="middle" class="diag-text-micro diag-text-micro-gold">境界の合否判定</text></g><path d="M670 100 H695 V70 H714" class="diag-line-green" marker-end="url(#perf-arrow-success)"/><rect x="674" y="56" width="34" height="18" rx="4" class="diag-badge-green"/><text x="691" y="69" text-anchor="middle" class="diag-text-badge diag-text-badge-green">YES</text><path d="M670 140 H695 V170 H714" class="diag-line-violet" marker-end="url(#perf-arrow-violet)"/><rect x="674" y="162" width="34" height="18" rx="4" class="diag-badge-violet"/><text x="691" y="175" text-anchor="middle" class="diag-text-badge diag-text-badge-violet">NO</text><g class="diag-group"><rect x="720" y="30" width="200" height="82" rx="12" class="diag-card-success"/><text x="734" y="58" class="diag-text-title diag-text-success-title">ブラウザ内完結</text><text x="734" y="82" class="diag-text-sub">標準DOM / Web APIを活用</text><text x="734" y="98" class="diag-text-sub">外部基盤を増やさず高速化</text></g><g class="diag-group"><rect x="720" y="128" width="200" height="82" rx="12" class="diag-card-highlight"/><text x="734" y="156" class="diag-text-title">Worker / CLIへ分離</text><text x="734" y="180" class="diag-text-sub">高負荷変換・隔離実行を</text><text x="734" y="196" class="diag-text-sub">独立ワーカーへオフロード</text></g></svg><figcaption>性能改善の数字を、そのまま採用理由にせず、実業務の測定結果から境界を決める。</figcaption></figure>`,
  'search-ai-controls':`<figure class="diagram article-diagram"><svg viewBox="0 0 940 240" role="img" aria-labelledby="prov-title prov-desc"><title id="prov-title">出典の鎖</title><desc id="prov-desc">候補情報を公式一次情報へ戻し、対象期間と判断をHTMLへ記録する。</desc><defs><marker id="prov-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" class="diag-marker"/></marker><marker id="prov-arrow-success" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" class="diag-marker-success"/></marker></defs><g class="diag-group"><rect x="20" y="30" width="200" height="180" rx="14" class="diag-card"/><rect x="34" y="44" width="80" height="22" rx="6" class="diag-badge-cyan"/><text x="74" y="59" text-anchor="middle" class="diag-text-badge diag-text-badge-cyan">01 発見入口</text><circle cx="185" cy="55" r="14" class="diag-badge-cyan"/><circle cx="183" cy="53" r="6" class="diag-icon-stroke-cyan"/><line x1="187" y1="57" x2="194" y2="64" class="diag-icon-stroke-cyan"/><text x="34" y="98" class="diag-text-title">候補記事・動画の発見</text><text x="34" y="128" class="diag-text-sub">SNS / YouTube / ニュース等</text><text x="34" y="148" class="diag-text-sub">「変化の兆候」を広く収集</text><text x="34" y="168" class="diag-text-sub">※この段階は採用根拠にしない</text><rect x="34" y="184" width="172" height="16" rx="4" class="diag-tag-bg"/><text x="120" y="196" text-anchor="middle" class="diag-text-micro">入口と根拠を峻別</text></g><g class="diag-chain-link"><line x1="220" y1="120" x2="246" y2="120" class="diag-line-flow" marker-end="url(#prov-arrow)"/><circle cx="233" cy="120" r="6" class="diag-badge-violet"/></g><g class="diag-group"><rect x="250" y="30" width="200" height="180" rx="14" class="diag-card"/><rect x="264" y="44" width="80" height="22" rx="6" class="diag-badge-violet"/><text x="304" y="59" text-anchor="middle" class="diag-text-badge diag-text-badge-violet">02 厳格照合</text><circle cx="415" cy="55" r="14" class="diag-badge-violet"/><path d="M410 50 L415 47 L420 50 V55 Q415 62 410 55 Z" class="diag-icon-stroke-violet"/><polyline points="412,54 414,56 418,52" class="diag-icon-stroke-violet"/><text x="264" y="98" class="diag-text-title">公式資料へ再照合</text><text x="264" y="128" class="diag-text-sub">Release Notes / RFC / 仕様</text><text x="264" y="148" class="diag-text-sub">提供日・バージョン・制約を</text><text x="264" y="168" class="diag-text-sub">開発元一次ソースで確定</text><rect x="264" y="184" width="172" height="16" rx="4" class="diag-tag-bg"/><text x="350" y="196" text-anchor="middle" class="diag-text-micro">一次情報で裏付け</text></g><g class="diag-chain-link"><line x1="450" y1="120" x2="476" y2="120" class="diag-line-flow" marker-end="url(#prov-arrow)"/><circle cx="463" cy="120" r="6" class="diag-badge-violet"/></g><g class="diag-group"><rect x="480" y="30" width="200" height="180" rx="14" class="diag-card"/><rect x="494" y="44" width="80" height="22" rx="6" class="diag-badge-gold"/><text x="534" y="59" text-anchor="middle" class="diag-text-badge diag-text-badge-gold">03 構造蒸留</text><circle cx="645" cy="55" r="14" class="diag-badge-gold"/><line x1="638" y1="49" x2="652" y2="49" class="diag-icon-stroke-gold"/><line x1="638" y1="55" x2="652" y2="55" class="diag-icon-stroke-gold"/><line x1="638" y1="61" x2="652" y2="61" class="diag-icon-stroke-gold"/><text x="494" y="98" class="diag-text-title">事実と判断を分離</text><text x="494" y="128" class="diag-text-sub">対象期間（週次）を固定</text><text x="494" y="148" class="diag-text-sub">「何が起きたか（事実）」と</text><text x="494" y="168" class="diag-text-sub">「どう動くか（判断）」を分離</text><rect x="494" y="184" width="172" height="16" rx="4" class="diag-tag-highlight-bg"/><text x="580" y="196" text-anchor="middle" class="diag-text-micro diag-text-micro-gold">構造化データ化</text></g><g class="diag-chain-link"><line x1="680" y1="120" x2="706" y2="120" class="diag-line-green" marker-end="url(#prov-arrow-success)"/><circle cx="693" cy="120" r="6" class="diag-badge-green"/></g><g class="diag-group"><rect x="710" y="30" width="210" height="180" rx="14" class="diag-card-success"/><rect x="724" y="44" width="88" height="22" rx="6" class="diag-badge-green"/><text x="768" y="59" text-anchor="middle" class="diag-text-badge diag-text-badge-green">04 追跡可能</text><circle cx="885" cy="55" r="14" class="diag-badge-green"/><rect x="878" y="47" width="14" height="16" rx="2" class="diag-icon-stroke-green"/><line x1="881" y1="52" x2="889" y2="52" class="diag-icon-stroke-green"/><line x1="881" y1="56" x2="889" y2="56" class="diag-icon-stroke-green"/><text x="724" y="98" class="diag-text-title diag-text-success-title">追跡可能なHTML正本</text><text x="724" y="128" class="diag-text-sub">外部依存ゼロの単体ファイル</text><text x="724" y="148" class="diag-text-sub">URL出典・日付・文脈を保持</text><text x="724" y="168" class="diag-text-sub">人間とAIが同じ根拠を検証</text><rect x="724" y="184" width="182" height="16" rx="4" class="diag-tag-success-bg"/><text x="815" y="196" text-anchor="middle" class="diag-text-micro diag-text-micro-green">自己完結・永続性</text></g></svg><figcaption>発見元と最終根拠を分け、後から人間とAIが同じ根拠を辿れるようにする。</figcaption></figure>`
};
function finalSvgFallback(id) {
  const titleId = `${id}-fallback-title`;
  const descId = `${id}-fallback-desc`;
  return `<figure class="diagram article-diagram diagram-fallback"><svg viewBox="0 0 940 180" role="img" aria-labelledby="${titleId} ${descId}"><title id="${titleId}">NotebookLM図解の最終フォールバック</title><desc id="${descId}">NotebookLMのPNG生成をこの号で完了できなかったため、記事の判断を次号へ持ち越さず、この記事内で確認可能なSVGとして残す。</desc><rect x="20" y="24" width="900" height="132" rx="14" class="diag-card"/><rect x="44" y="48" width="152" height="28" rx="7" class="diag-badge-violet"/><text x="120" y="68" text-anchor="middle" class="diag-text-badge diag-text-badge-violet">FINAL SVG</text><text x="44" y="106" class="diag-text-title">NotebookLM図解の最終フォールバック</text><text x="44" y="132" class="diag-text-sub">PNG生成を完了できなかったため、未埋め込みを次号へ持ち越さず、この号の本文内SVGで判断の入口を固定する。</text><line x1="650" y1="90" x2="745" y2="90" class="diag-line-flow"/><rect x="760" y="54" width="130" height="72" rx="10" class="diag-card-success"/><text x="825" y="83" text-anchor="middle" class="diag-text-title diag-text-success-title">この号で完結</text><text x="825" y="108" text-anchor="middle" class="diag-text-sub">再試行しない</text></svg><figcaption>NotebookLM図解の最終フォールバック。生成失敗を翌週へ引き継がず、この記事で読めるアクセシブルなSVGを最終成果物として保存する。</figcaption></figure>`;
}

async function collectFinalSvgFallbackIds(rootUrl = new URL('./', import.meta.url)) {
  const ids = new Set();
  for (const issue of renderedIssues) {
    try {
      const document = JSON.parse(await readFile(new URL(`assets/diagrams/${issue.issue}.jobs.json`, rootUrl), 'utf8'));
      for (const job of document.jobs ?? []) {
        if (job.status === 'fallback-inline-svg') ids.add(job.articleId);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error(`failed to load diagram jobs for ${issue.issue}`, { cause: error });
    }
  }
  return ids;
}

function extendArticleDiagrams(html, cliInfographicFigures, generatedDiagramIds, fallbackIds = new Set()){
  for(const id of new Set([...Object.keys(articleDiagrams),...Object.keys(cliInfographicFigures),...generatedDiagramIds,...fallbackIds])){
    const diagram=articleDiagrams[id] ?? (fallbackIds.has(id) ? finalSvgFallback(id) : '');
    const generatedFigure = fallbackIds.has(id) ? '' : (cliInfographicFigures[id] ?? '');
    const marker=`<article data-article-id="${id}">`;
    const match=new RegExp(`(${marker}[\\s\\S]*?<p class="take">[\\s\\S]*?<\\/p>)`).exec(html);
    if(match) html=html.replace(match[1],`${match[1]}${diagram}${generatedFigure}`);
  }
  return html;
}
function injectDiagramsIntoProvisionalHtml(html, cliInfographicFigures) {
  html = html.replace(/<figure class="diagram article-diagram generated-infographic">[\s\S]*?<\/figure>/g, '');
  for (const [id, figure] of Object.entries(cliInfographicFigures)) {
    const marker = `<article data-article-id="${id}">`;
    const artIdx = html.indexOf(marker);
    if (artIdx === -1) continue;
    const endArtIdx = html.indexOf('</article>', artIdx);
    const slice = html.substring(artIdx, endArtIdx);
    const svgFigMatch = slice.match(/(<figure class="diagram">[\s\S]*?<\/figure>)/);
    if (svgFigMatch) {
      const target = svgFigMatch[1];
      html = html.replace(target, `${target}${figure}`);
    } else {
      const takeMatch = slice.match(/(<p class="take">[\s\S]*?<\/p>)/);
      if (takeMatch) {
        const target = takeMatch[1];
        html = html.replace(target, `${target}${figure}`);
      }
    }
  }
  return html;
}
const renderedIssues = issues.map((issue) => materializeIssue(issue));
const provisionalIssues = [
  materializeProvisionalIssue({issue:'2026-08-02',start:'2026-07-27',end:'2026-08-02',lead:'ローカルAIとWeb標準の接点を見る。',articleIds:['node-security-july-2026','npm-publish-scan','github-actions-approval','copilot-managed-settings']}),
  materializeProvisionalIssue({issue:'2026-08-09',start:'2026-08-03',end:'2026-08-09',lead:'環境を選ぶ前に、境界を選ぶ。',articleIds:['deno-2-9-5','agents-python-0-19-4','uv-0-12-3','electron-43-3-0','langchainjs-local-file-store']}),
];
const all=[...renderedIssues,...provisionalIssues].sort((a,b)=>b.issue.localeCompare(a.issue));
const numberByIssue=new Map([...all].sort((a,b)=>a.issue.localeCompare(b.issue)).map((x,index)=>[x.issue,String(index+1).padStart(2,'0')]));
const stateRank={'導入候補':4,'小さく試験':3,'設計へ反映':2,'継続監視':1};
function indexRelevance(issue){
  const articleIds=issue.articles.map((article)=>article.articleId);
  const linked=new Map();
  for(const id of articleIds){
    const item=relevance[id];
    for(const [label,url] of item?.links??[]){
      const candidate={label,url,state:item.state,rank:stateRank[item.state]??0,isProject:label.startsWith('Project:')};
      const current=linked.get(url);
      if(!current||candidate.rank>current.rank) linked.set(url,candidate);
    }
  }
  const sorted=[...linked.values()].sort((a,b)=>b.rank-a.rank||Number(a.isProject)-Number(b.isProject));
  if(!sorted.length) return '';
  const visible=sorted.slice(0,3).map((item)=>`<a class="related-link" href="${item.url}" target="_blank" rel="noreferrer">${item.label} →</a>`).join('');
  const more=sorted.length>3?`<span class="related-more">ほか${sorted.length-3}件</span>`:'';
  return `<div class="index-relevance" aria-label="既存案件との関連">${visible}${more}</div><small class="index-snapshot">Linear照合: 2026-08-16時点</small>`;
}

function buildArticleLinkData(issuesForCoverage) {
  const articles = issuesForCoverage.flatMap((issue) => {
    const issueArticles = issue.articles.map((article) => {
      const sourceHtmlPath = issue.pageStatus === 'generated' ? `${issue.issue}.html` : null;
      const sourceSectionLabel = article.articleId === 'ai-self-update-recheck' ? recheckSectionLabel(issue.issue) : issue.issue;
      return {
        issue: issue.issue,
        pageStatus: issue.pageStatus,
        articleId: article.articleId,
        title: article.title ?? null,
        titleDisplay: article.title ?? 'タイトル未展開',
        knowledgeIds: article.knowledgeIds,
        relatedKnowledgeCount: article.knowledgeIds.length,
        knowledgeDelta: article.knowledgeDelta || '',
        status: article.knowledgeIds.length ? 'linked' : 'registered',
        registrationType: 'article',
        sourceHtmlPath,
        sourceSectionLabel,
        canonicalUrl: article.url ?? null,
      };
    });
    if (issue.pageStatus === 'generated' && recheckByIssue.has(issue.issue)) {
      issueArticles.push({
        issue: issue.issue,
        pageStatus: issue.pageStatus,
        articleId: 'ai-self-update-recheck',
        title: recheckSectionLabel(issue.issue),
        titleDisplay: recheckSectionLabel(issue.issue),
        knowledgeIds: [],
        relatedKnowledgeCount: 0,
        knowledgeDelta: '',
        status: 'registered',
        registrationType: 'article',
        sourceHtmlPath: `${issue.issue}.html`,
        sourceSectionLabel: recheckSectionLabel(issue.issue),
        canonicalUrl: null,
      });
    }
    return issueArticles;
  });
  const linkedArticles = articles.filter((article) => article.status === 'linked').length;
  const registeredArticles = articles.filter((article) => article.status === 'registered' || article.status === 'linked').length;
  return {
    schemaVersion: 2,
    aiSearchEntry: {
      path: 'knowledge/AI_SEARCH.md',
      purpose: 'AI が最初に読む固定入口',
    },
    generatedFrom: 'build.mjs',
    summary: {
      totalArticles: articles.length,
      registeredArticles,
      linkedArticles,
      registeredWithoutKnowledge: registeredArticles - linkedArticles,
      unregisteredArticles: articles.length - registeredArticles,
      statusLegend: 'registered = 記事として登録済み, linked = 既存 knowledge へ接続済み, related knowledgeなし = article 登録のみ',
    },
    articles,
  };
}

function renderArticleCoveragePage(linkData) {
  const rows = linkData.articles.map((article) => {
    const relatedKnowledge = article.status === 'linked'
      ? article.knowledgeIds.map((id) => `<a href="${id}.html">${id}</a>`).join('<br>')
      : '<span class="muted">関連知識なし</span>';
    const sourceHtml = article.sourceHtmlPath
      ? `<a href="../../${article.sourceHtmlPath}">${article.sourceHtmlPath}</a>${article.sourceSectionLabel ? `<div class="muted">${article.sourceSectionLabel}</div>` : ''}`
      : '<span class="muted">暫定号のため未生成</span>';
    const canonicalUrl = article.canonicalUrl
      ? `<a href="${article.canonicalUrl}" target="_blank" rel="noreferrer">${article.canonicalUrl}</a>`
      : '<span class="muted">データなし</span>';
    return `<tr><td data-label="号">${article.issue}</td><td data-label="範囲">${article.pageStatus === 'generated' ? '生成対象' : '暫定号'}</td><td data-label="記事ID"><span class="mono">${article.articleId}</span></td><td data-label="タイトル">${article.title ?? '<span class="muted">タイトル未展開</span>'}</td><td data-label="元HTML">${sourceHtml}</td><td data-label="公式原典URL">${canonicalUrl}</td><td data-label="関連知識">${relatedKnowledge}</td><td data-label="登録種別">${article.registrationType} / ${article.status}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Karpathy Wiki 記事関連付け一覧</title><style>:root{color-scheme:light;--bg:#f5f0e7;--panel:#fffaf2;--line:#d0c5b6;--ink:#292722;--muted:#6b655d;--accent:#28585a;--accent-soft:#e2eeee;--gold:#8b6a2b;--gold-soft:#f3ead7}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#efe4cf,transparent 28rem),var(--bg);color:var(--ink);font-family:"Yu Gothic UI","Hiragino Sans",system-ui,sans-serif;line-height:1.7}a{color:var(--accent);text-underline-offset:3px}.shell{width:min(1400px,calc(100% - 32px));margin:auto}header{padding:40px 0 24px;border-bottom:1px solid var(--line)}main{padding:28px 0 40px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 20px}.card,.panel{padding:18px 20px;border:1px solid var(--line);border-radius:18px;background:var(--panel)}.card strong{display:block;font-size:1.8rem;line-height:1.1}.small,.muted{color:var(--muted)}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden}th,td{padding:12px 14px;border-top:1px solid var(--line);vertical-align:top;text-align:left;word-break:break-word}th{font-size:.82rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.status-links{display:grid;gap:4px}@media(max-width:900px){.grid{grid-template-columns:1fr}table,thead,tbody,tr,th,td{display:block}thead{position:absolute;width:1px;height:1px;overflow:hidden}td{border-top:0}td::before{content:attr(data-label);display:block;font-size:.76rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}}</style></head><body><header><div class="shell"><p class="small"><a href="index.html">Karpathy Wiki</a></p><h1>Karpathy Wiki 記事関連付け一覧</h1><p>TechNews の全記事を、記事由来の事実を保持する article 登録と、公式検証済み knowledge への接続を分けて追跡する。</p><p><a href="../AI_SEARCH.md">AI検索入口</a> / <a href="../article-links.json">article-links.json</a></p></div></header><main class="shell"><section class="grid"><article class="card"><strong>全記事 ${linkData.summary.totalArticles} 件</strong><span class="small">build.mjs 走査対象</span></article><article class="card"><strong>登録済み ${linkData.summary.registeredArticles} 件</strong><span class="small">article/source として確認済み</span></article><article class="card"><strong>関連あり ${linkData.summary.linkedArticles} 件</strong><span class="small">knowledgeIds あり</span></article><article class="card"><strong>未登録 ${linkData.summary.unregisteredArticles} 件</strong><span class="small">探索対象から漏れている記事</span></article></section><section class="panel"><p class="small">\`registered\` は記事として登録済み、\`linked\` は knowledge に接続済み、\`関連知識なし\` は article 登録のみを意味する。</p><table><thead><tr><th>号</th><th>範囲</th><th>記事ID</th><th>タイトル</th><th>元HTML</th><th>公式原典URL</th><th>関連知識</th><th>登録種別</th></tr></thead><tbody>${rows}</tbody></table></section></main></body></html>`;
}
// 再判定レーダーを載せ始めた号。これ以降で recheck を持たない号は「未確認」として警告する。
// 過去号へ遡って後付けはしない（当時の判断を後から作ることになるため）。
const RECHECK_SINCE = '2026-08-16';

async function buildSite() {
  const unverified = renderedIssues.filter((x) => x.issue >= RECHECK_SINCE && !recheckByIssue.has(x.issue)).map((x) => x.issue);
  const orphaned = [...recheckByIssue.keys()].filter((date) => !renderedIssues.some((x) => x.issue === date));
  if (orphaned.length) {
    console.warn(`[warn] 対応する号が無い再判定: ${orphaned.join(', ')} — 号を build.mjs へ追加するまで紙面には出ない`);
  }
  if (unverified.length) {
    console.warn(`[warn] 再判定レーダー未確認の号: ${unverified.join(', ')} — 該当が無かった週も recheck/<号>.json に [] を置いて「確認して該当なし」と記録する`);
  }

  await generateCompressedImages({ rootUrl: new URL('./', import.meta.url) });
  const { cliInfographicFigures, generatedDiagramIds } = await collectCliInfographicFigures();
  const fallbackDiagramIds = await collectFinalSvgFallbackIds();
  const articleLinkData = buildArticleLinkData(all);
  await mkdir(new URL('./knowledge/wiki/', import.meta.url), { recursive: true });
  await writeFile(new URL('./knowledge/article-links.json', import.meta.url), `${JSON.stringify(articleLinkData, null, 2)}\n`, 'utf8');
  await writeFile(new URL('./knowledge/wiki/articles.html', import.meta.url), `${renderArticleCoveragePage(articleLinkData)}\n`, 'utf8');
  for (const issue of renderedIssues) {
    await writeFile(
      new URL(`./${issue.issue}.html`, import.meta.url),
      extendArticleDiagrams(page(issue), cliInfographicFigures, generatedDiagramIds, fallbackDiagramIds),
      'utf8',
    );
  }
  for (const issue of provisionalIssues) {
    const fileUrl = new URL(`./${issue.issue}.html`, import.meta.url);
    const originalHtml = await readFile(fileUrl, 'utf8');
    const updatedHtml = injectDiagramsIntoProvisionalHtml(originalHtml, cliInfographicFigures);
    await writeFile(fileUrl, updatedHtml, 'utf8');
  }

  const cards=all.map(x=>`<article class="issue-card" data-issue-date="${x.issue}"><div class="card-meta"><span class="issue-number">第${numberByIssue.get(x.issue)}号</span><time>${x.issue}</time></div><h2><a class="issue-link" href="${x.issue}.html">${x.lead}</a></h2>${indexRelevance(x)}<p>${x.start} – ${x.end} · ${x.articles.length}件</p></article>`).join('');
  const index=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TechNews Weekly Archive</title><style>${css}.archive{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:34px 0}.issue-card{display:block;padding:22px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(145deg,#242133,#15151d);color:var(--ink)}.issue-card:hover{border-color:var(--violet);transform:translateY(-2px)}.card-meta{display:flex;align-items:center;gap:10px}.issue-number{padding:3px 8px;border-radius:999px;background:#33274b;color:#e8dcff;font-size:.75rem;font-weight:900}.issue-card time{color:var(--cyan);font-weight:800}.issue-card h2{margin:.4rem 0}.issue-link{color:var(--ink);text-decoration:none}.issue-link:hover{text-decoration:underline}.index-relevance{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 5px}.related-link,.related-more{padding:4px 8px;border:1px solid #4c4565;border-radius:8px;background:#171420;color:#d8caff;font-size:.72rem;font-weight:700;text-decoration:none}.related-link:hover{border-color:var(--violet)}.related-more{color:var(--muted)}.index-snapshot{display:block;margin-bottom:12px;color:var(--muted);font-size:.68rem}.issue-card p{margin:0;color:var(--muted)}@media(max-width:700px){.archive{grid-template-columns:1fr}}</style></head><body><header><div class="shell"><div class="eyebrow">15 completed weeks</div><h1>TechNews Weekly Archive</h1><p class="lead">2026年5月11日から8月23日まで。情報量が少ない週も水増しせず、公式一次情報と開発方針への影響を分けて記録した試作アーカイブ。</p></div></header><main class="shell"><div class="archive">${cards}</div></main><footer><div class="shell">各号は単体で開けるHTML。外部ライブラリ、サーバー、ビルド環境は不要です。 ／ <a href="claude-update/index.html">Claude 自身の更新（サブ機能）</a></div></footer></body></html>`;
  await writeFile(new URL('./index.html',import.meta.url),index,'utf8');
  const relevanceResult = await applyRelevance(new URL('.', import.meta.url));
  const themeResult = await applyTheme(new URL('.', import.meta.url));
  const recheckIssues = renderedIssues.filter((x) => recheckByIssue.has(x.issue));
  const recheckItemCount = recheckIssues.reduce((total, x) => total + recheckByIssue.get(x.issue).length, 0);
  console.log(`generated ${renderedIssues.length} issues + index; connected ${relevanceResult.articles} articles to current work; themed ${themeResult.files} files; recheck ${recheckIssues.length} issues / ${recheckItemCount} items; knowledge coverage ${articleLinkData.summary.linkedArticles}/${articleLinkData.summary.totalArticles}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite();
}
