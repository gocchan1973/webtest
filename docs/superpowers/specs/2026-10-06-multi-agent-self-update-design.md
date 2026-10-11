# self-update の多エージェント化（Claude 以外への拡張と相互参照）設計メモ

**作成日:** 2026-10-06
**状態:** 設計案。**段階0・1・2・3を実装済み（2026-10-06、Claude のみ・出力不変。段階3は読み込み・検証のみで HTML・注入は無し）。続けて §9 の一式（状態の導出・status.json 検証・Claude 直下の agent 制限・リポ内 Markdown 生成・finalize 警告）を親セッションの判断で実装済み（ユーザー未承認）**、段階4以降の「~/.codex への接続」は未実装でユーザー判断待ち。外部添削は未実施（提案のみ。実施はユーザー判断）。同日、Codex / Copilot / Agy / Hermes に相談した結果を §3(b)・(d)〜(g)・§5・§6 に反映した
**関連:** `build.mjs`、`emit-recheck.mjs`、`F:/Dev_hub/scripts/inject_recheck.py`、`claude-update/`、`codex-update/`、`docs/自己更新チェックからの申し送り_2026-10-06.md`、`docs/superpowers/specs/2026-09-10-claude-update-design.md`

## 1. 目的と非目的

### 目的

1. TechNews（読者向け記事）と self-update（AI 自身が学習カットオフ以降の公式更新を取り込み、自分のハーネスを改善する提案）の**同居を維持する**。横断した判断・アイデア発掘が同居の価値であるため（ユーザーの意図）。
2. self-update を Claude だけでなく **Codex・Gemini など他エージェントへ広げる**。元々は AI の学習カットオフの補填・自己改善の機能であり、Claude 専用ではない。
3. 各エージェントが**互いの更新を知り合える**ようにする。ただし自分に無関係なものを注入で肥大させない。

### 非目的

- self-update の物理分離（別リポへの切り出し）。
- 記事側（週次の `issues`、記事 HTML の見た目、採用基準）の変更。
- `F:/Gemini_Env/` の変更。Agy CLI の領域であり、本メモの変更案にも含めない。
- 設定ファイル（`.assetsignore` など）の変更。§5 で提案に留める。

## 2. 現状の実測

2026-10-06 に `build.mjs` / `emit-recheck.mjs` / `inject_recheck.py` / `recheck/*.json` / `codex-update/` / `claude-update/` / `~/.codex` を読んで確認した。事前の棚卸し（`C:/Users/Owner/.claude/tmp/inventory-technews-selfupdate.md`）は要約数行のみだったため、以下は自分で読み直した結果。

### 2.1 データの流れ（Claude 側・提案の層）

```text
週次 self-update-check スキル(Dev_hub/skills/claude/…/finalize.mjs)
  → recheck/<号>.json          …正本（週次タスクが直接書く）
  → build.mjs                  …import 時に recheck/*.json を全件 validateRecheck（L138-144）
                                 号 HTML の「ハーネス改善提案」枠を描画（L308-324, L328）
  → emit-recheck.mjs           …生成済み HTML を正規表現で読み戻す（L13-25）→ latest-recheck.md（L89）
  → ~/.claude/settings.json の SessionStart → inject_recheck.py が latest-recheck.md を注入
```

HTML が中間生成物になっている。`recheck/*.json` から `latest-recheck.md` へ直接行く経路は無い。

### 2.2 recheck JSON のスキーマ（実ファイルと `validateRecheck` から）

ファイル名は `recheck/<YYYY-MM-DD>.json`、中身は項目の配列。`[]` は「確認して該当なし」、ファイル無しは「未確認」（README L86-94）。

| フィールド | 型 | 必須 | 備考 |
|---|---|---|---|
| `status` | string | 必須 | v2（`2026-09-27` 号以降）は `改善提案` / `回避策の撤去` / `追従が必要` のみ（L94, L129） |
| `title` | string | 必須 | |
| `fields` | `[ラベル, 値][]` | 必須 | v2 はラベルが順に `現状のハーネス` `公式の変更` `提案` `期待する改善` `確認方法` に固定（L93, L123） |
| `links` | `[ラベル, URL \| {sourceId}][]` | 必須 | 1件以上。`{sourceId}` は `sources.mjs` の id へ解決（L84-89） |
| `harness` | string[] | v2 で必須 | 対象ファイルパス。**エージェント区別はこのパスの中身しか無い** |
| `work` / `workComment` | 任意 | 任意 | `2026-08-30.json` にのみ存在。`validateRecheck` の戻り値に含まれず（L115-120）、`emit-work-reverse-index.mjs`（L44-55）が生ファイルを直接読んでいる |

**エージェントを区別するフィールドは無い。** 実在する7ファイルのうち `2026-10-04.json` を含む v2 の項目は、すべて対象が `C:/Users/Owner/.claude/…` や `F:/Dev_hub/…`（Claude のハーネス）。

### 2.3 棚卸しとの食い違い・追加で分かったこと

| # | 内容 |
|---|---|
| 訂正1 | 棚卸し時点の認識「claude-update/ と codex-update/ は既にあるが build.mjs 非依存」は正しいが、**実装の厚みが違う**。`codex-update/` は `inject.mjs`（SessionStart 用注入）・`sync-global.mjs`（`~/.codex/AGENTS.md` の管理ブロックへ検証済みスナップショットを同期）・`record-hit.mjs` まで揃っている。`~/.codex/AGENTS.md` に管理ブロック（`<!-- codex-update:start -->`）が**実在**する（生成日 2026-09-11 のスナップショット）。Codex 側の「事実（facts）の注入」は既に動いており、無いのは**提案（recheck 相当）の層** |
| 訂正2 | 2つの層が別物として並んでいる。`claude-update/` と `codex-update/` は **facts**（事実と `behavior`）の層で、スキーマも `facts.json` / `issues/<号>.json` と別。`recheck/` は**ハーネス改善の提案**の層。Claude だけが両方を持ち、Codex は facts のみ、Gemini は両方とも無い |
| 訂正3 | Claude の注入は `inject_recheck.py` が `latest-recheck.md`（提案）に `claude-update/latest.md`（facts）を足している（L48-63, L177-191）。合算上限 `MAX_CHARS = 12000`（L68）。`latest-recheck.md` は 17042 バイトだが、上限は文字数（`len(body)`）で見ているため、バイト数との単純比較は不可（実際の文字数は未計測） |
| 訂正4 | 参照実績の記録先が非対称。`recheck-hits.jsonl` は実在（2行）、`claude-update/hits.jsonl` は `inject_recheck.py` L60-63 が指す先だが**ファイルが存在しない**。`codex-update/hits.jsonl` は実在 |
| 訂正5 | 公開範囲の件名の訂正: 依頼文は「`firebase-auth-poc` の `.assetsignore`」としていたが、`firebase-auth-poc/` に `.assetsignore` は**無い**。`wrangler.toml` が `assets.directory = ".."` でリポ直下を配信するため、効くのはルートの `.assetsignore`（`.git` `node_modules` `.playwright-cli` `.claude` `.wrangler` `.technews-release-state.json` `assets/diagrams/original`）。そこに `recheck/` `latest-recheck.md` `weekly-updates/` `claude-update/` `codex-update/` `recheck-hits.jsonl` は含まれない |
| 追加1 | `finalize.mjs`（スキル側）がこのリポに強く依存している（申し送り §2）。`build.mjs` の import 時の全件検証、`node build.mjs → emit-recheck.mjs → emit-work-index.mjs` の順序、`latest-recheck.md` の書式（`対象号:` 行・「更新なし」・`## [status] title`）。`tests/finalize-contract.test.mjs` が契約テスト |
| 追加2 | `emit-recheck.mjs` L40 に `HARNESS_PROPOSAL_SINCE = '2026-09-27'` が**重複定義**されている（`build.mjs` L92 と同値のコメント付き）。片方だけ変えると食い違う |
| 追加3 | `ai-self-update-recheck` は号ごとに1件だけ記事台帳へ登録される（`build.mjs` L511-526）。`sources.mjs` の3出典（OpenAI/ChatGPT Codex changelog、Claude Code changelog、Anthropic Newsroom）はすべて `destination: 'ai-self-update-recheck'` で、**OpenAI の changelog も Claude 用と同じ宛先**に入る |
| 追加4 | Codex 側の定期実行（`~/.codex/automations/`）は `technews-weekly` / `technews-karpathy-wiki-monitor` / `webmcp` が実在。`grep` で `recheck` / `self-update` を含む自動化は**見つからなかった**（`automation.toml` に当該語なし）。Codex 向けの self-update 提案を書く担当・仕組みは現時点で無い |
| 追加5 | `Dev_hub/skills/codex/` に self-update 系スキルは無い（`ask-hermes` `async-subagent-ops` `codex-session-stats` `youtube-compress-upload`）。self-update-check は `skills/claude/` のみ |

## 3. 設計判断

共通の前提: 既存の `recheck/<号>.json`・`latest-recheck.md`・`finalize.mjs`・`tests/finalize-contract.test.mjs` は**動いており、Claude 側を壊さない**ことを最優先とする（段階1〜は Claude の出力を変えない）。

### (a) 出力の単位

| 案 | 内容 | 判定 |
|---|---|---|
| A1 | `recheck/<号>.json` の項目に `agent` フィールドを足し、1ファイルに全エージェント分を入れる | 見送り |
| **A2** | **Claude は現状維持（`recheck/<号>.json` = agent `claude`）。他エージェントは `recheck/<agent>/<号>.json`** | **採る** |
| A3 | 全部 `recheck/<agent>/<号>.json` へ移し、Claude も移動する | 見送り（段階を分ける） |

**採る理由（A2）:**

- 「未確認」と「確認して該当なし」の区別（ファイル無し / `[]`）が**エージェントごとに必要**。A1 では1エージェントが確認済みでも別エージェントが未確認、という状態を表せない。
- 書く主体が別（Claude は self-update-check スキル。Codex・Gemini は別の週次実行）。1ファイルを複数の書き手が更新すると、スキル側の再生成（「既存ファイルがある号は検証だけで終えることがある」申し送り §3）と衝突しうる。
- 1エージェントの不正ファイルで `validateRecheck` が `throw` し、**他エージェントと TechNews 全体の build まで止まる**（現状 L141-143 の挙動）。ディレクトリを分けても、検証失敗を全体停止にするかは §4 段階2で別途決める。

**見送った案と理由:**

- A1: 上記「未確認／該当なし」の表現力と、書き手衝突が理由。
- A3: `finalize.mjs`・`tests/finalize-contract.test.mjs`・申し送りの契約がすべて `recheck/<号>.json` を前提にしているため、今移すと Dev_hub 側スキルまで同時に直す必要がある。**移行は他エージェントが実際に運用に乗り、Claude 側スキルを直すタイミングが来てから**で足りる。

**前提:** Claude 以外の提案を書く担当が実在すること（現状は無い。§5 参照）。崩れる条件: 書き手が全エージェントで同一になる場合は A1 でも衝突しない。

**どのエージェントのファイルか（agent の決め方）:** ディレクトリ名を正とする。`harness` のパスが別エージェントのホーム（例: `~/.codex` 配下なのに `claude` 扱い）を指していたら、検証で警告する（推測で書き換えない）。

### (b) 注入の単位

**採る案:** エージェントごとに注入用 Markdown を持ち、**`recheck/…json` から直接生成**する。HTML は表示の1つに格下げする。

- Claude: `latest-recheck.md`（名前・書式は維持。`inject_recheck.py` L48-51 のパス、`finalize.mjs` の照合が依存）
- Codex: `latest-recheck-codex.md` を新設し、既存 `codex-update/sync-global.mjs` の管理ブロックへ載せる経路に統合する（**§9 で訂正・方針変更**: 16 KiB は管理ブロックではなく置換後の AGENTS.md 全体の上限。管理ブロックへ本文を埋め込む案は見送り）
- Gemini（Agy）・Hermes・Copilot: 下の「エージェント別の注入経路」で個別に扱う。**注入経路は全エージェント共通ではなく、エージェントごとに別**（2026-10-06 の相談で判明。§6）。

#### エージェント別の注入経路（2026-10-06 追記）

背景: 当初の案は、Claude の `SessionStart` hook（`inject_recheck.py`）方式を他エージェントにも当てはめられる前提を含んでいた。各エージェントに自分の環境を答えさせたところ、読み込み経路が揃っていないことが分かった。**以下の「自己申告」は各エージェントの回答であり、私が実環境で確かめたものではない**（確かめた範囲は §6）。

| エージェント | 採る経路 | 根拠（自己申告か実測か） | 状態 |
|---|---|---|---|
| Claude | 既存の `SessionStart` → `inject_recheck.py` が `latest-recheck.md` を注入 | 実在・稼働中（`inject_recheck.py` を読んで確認済み） | 現状維持 |
| Codex | 既存の `~/.codex/AGENTS.md` 管理ブロック（`<!-- codex-update:start -->`）。`codex-update/sync-global.mjs` が再生成 | 管理ブロックの実在は私が確認済み（§2.3 訂正1）。Codex 自身は「SessionStart フックの実行は確認できていない」と回答 | 既存の経路に載せる |
| Agy | `GEMINI.md` / `AGENTS.md` の管理ブロックを**同期スクリプトで書く**（Claude の hook 方式は流用できない） | Agy の自己申告:「`SessionStart` フックは無い。使えるのは `PreToolUse` / `PostToolUse` / `PreInvocation` / `PostInvocation` / `Stop` のみ」。**未検証**（私は Agy の hook 仕様を確かめていない）。`GEMINI.md` / `AGENTS.md` が CWD から上位へ探索され常時ロードされる、も自己申告 | 経路は仮置き。実機確認が要る |
| Hermes | `MEMORY.md`（`C:/Users/Owner/AppData/Local/hermes/memories/MEMORY.md`）に**3〜5行**だけ置き、詳細は `recheck/hermes/<号>.json` を必要時に読む二層 | Hermes の自己申告:「MEMORY.md の上限は 2,200 字」。**実測**: 現行 MEMORY.md は 2,278 文字（`wc -m`、2026-10-06）で、**自己申告の上限をすでに超えている**。上限の数え方（文字／バイト、改行の扱い）か、空きがほぼ無い可能性があり**未確認** | 余地が無い恐れ。要確認 |
| Copilot | **保留**。読み込まれる指示ファイルが未確認 | Copilot の回答: ヘルプ上の候補は `~/.copilot/copilot-instructions.md`、`~/.copilot/instructions/**/*.instructions.md`、リポジトリ内 `AGENTS.md`、`.github/copilot-instructions.md`。**どれが実際に読まれているかは確認できていない**（権限拒否で `~/.copilot` を読めなかったため。サイズ上限の記載も見当たらないとのこと） | 決められない。起動時の読み込み実績の確認が先 |

見送った案:

- 全エージェントに `SessionStart` hook を配る: Agy に同名イベントが無い（自己申告）、Codex は hook の信頼登録が要る（`codex-update/facts.json` の fact）、Copilot は未確認。**そろわない経路を前提にした設計は崩れる**ため見送り。
- Hermes に管理ブロック方式を当てる: MEMORY.md は 2,200 字制の自由記述で、複数行のブロックを再生成して置換する運用は前提が違う。3〜5行の要約＋詳細は必要時に読む、が Hermes 自身の提案でもある（Hermes はスキルを必要時にロードする構造で、常時注入量を増やすほど判断ノイズになる、との回答）。

**注意:** Codex と Copilot の回答は、どちらも一部のファイル読み取りが権限エラーで失敗した状態でのものだった（`codex.err` / `copilot.txt` に痕跡）。両者の (d)（対象パス・上限）は**渡された文脈と CLI ヘルプに基づく**回答で、実環境の確認ではない。

**根拠:** 今の `emit-recheck.mjs` は HTML の `class="recheck-item"` / `class="recheck-status"` / `<p><strong>ラベル：` といった**描画の内部構造を正規表現で読み戻している**（L13-25）。`build.mjs` の描画（L308-324）を直すと注入元が静かに空になる、という脆さがある。正本は既に JSON（README L88）であり、JSON から MD を直接作れば HTML 依存が消える。

**見送った案:**

- HTML 正規表現を直し続ける: 描画変更のたびに壊れうる。
- `latest-recheck.md` を1本にして全エージェント分を入れる: Claude だけに効く提案を Codex に注入することになり、肥大する（要件(3)に反する）。
- `latest-recheck.md` を `latest-recheck-claude.md` へ改名: 契約3（書式）と `inject_recheck.py` L48-51 の既定パスに触る。段階を分ける。

**注意点（壊しうる箇所）:** 現行 `emit-recheck.mjs` は「`recheck-radar` セクションが HTML にあるか」で対象号を決め、「未確認の号」（L79-81）も HTML ファイルの有無で計算している。JSON 直読みに替えるときは、**現行の出力と文字単位で一致することを 2026-10-04 号で確認してから**切り替える（一致確認は 2026-10-06 に 2026-10-04 号で実施済み（§4 段階1）。§5）。

### (c) 共通層と相互参照

#### 共通層

**採る案:** 次を「全エージェント共通」に置き、エージェント別の属性は**フィールドで持つ**（ディレクトリは複製しない）。

| 共通層 | 現状 | 変更案 |
|---|---|---|
| `sources.mjs`（出典台帳） | 全出典が `destination: 'ai-self-update-recheck'`、`agent` の区別なし | 出典に任意の `agent`（`claude` / `codex` / `agy` / `all`（2026-10-06 に gemini を agy へ読み替え。Gemini CLI は廃止済みでその後継が Agy CLI、ユーザー指摘））を足す。`resolveRecheckLink`（L84-89）は変えず、台帳の整合検査だけ足す |
| `discovery/<号>.json` | 週次の発見元（YouTube 等）。`toolWatch` を `claude-update/watch.mjs` と `codex-update/watch.mjs` がそれぞれ読む | 変更なし。共有のまま、watch 側で各エージェント向けに印を付ける現状を維持 |
| `knowledge` 登録 | 号ごとに記事 `ai-self-update-recheck` を1件（`build.mjs` L511-526）、`sourceSectionLabel` は `recheckSectionLabel`（L97, L494） | **1件のまま**にする。エージェント別に記事を増やさない（記事側は非目的）。ラベルにエージェント名を括弧で併記する程度に留める |
| `work-index` | `recheck` 項目の `work` を逆引きへ載せる（`emit-work-reverse-index.mjs` L43-55）。記事は `ai-self-update-recheck` 固定 | 項目に `agent` を持たせ、逆引きの行にエージェントを出す。記事ID自体は固定のまま |

**見送った案:** エージェントごとに `ai-self-update-recheck-codex` のような別記事IDを作る。`relevance.mjs` L97・`publish-technews.mjs` L75（`id !== 'ai-self-update-recheck'` の除外）・knowledge の記事一覧など固定IDを前提とする箇所が増えるうえ、記事側の変更になる（非目的）。

#### 相互参照

**採る案:** 各提案項目に任意フィールド **`alsoAffects: ['codex', …]`** を持たせる。書いた側のエージェントが「他エージェントにも効く」と判断した項目だけ、相手の注入ファイルに「他エージェント由来」節として**1項目につきタイトル・状態・出典の要約数行**だけ載せる。

- **自分に無関係なものを載せない**: 既定は載せない（`alsoAffects` が空）。全文クロス注入はしない。
- **肥大対策**: 「他エージェント由来」節に件数上限（案: 3件、各5行程度）を置く。上限超過は件数と参照先パスだけを示す。既存の `MAX_CHARS`（`inject_recheck.py` L68 の12000文字、Codex は 16 KiB）の枠内で、固有分を優先し他社分を削る順にする。
- **索引は軽く常設**: 全エージェント分の「今週は claude 5件 / codex 0件 / agy 未確認」の1行は、肥大にならないため注入に含める。**「未確認」と「該当なし」を区別して出す**（現行 README の原則と揃える）。

**根拠:** 判断は書いた側（その提案の根拠を読んだ側）が一番できる。受け手が機械的に「関係あり」と推測すると、`rules/speculation-with-evidence` に反して根拠なしの推測を注入することになる。タグが書かれていないものは「関係なし」ではなく「判断されていない」ので、**索引の件数行で存在は見える**ようにする。

**見送った案:**

- 全エージェントの提案を全員に注入: 肥大（要件(3)）。
- キーワードで自動判定して他エージェントへ配る: 誤判定のコストが読み手の判断汚染になり、根拠の無い推測を挟む。
- 相互参照を作らず、各エージェントが必要時に `recheck/` を自分で読む: `rules/` の経験（「読めと書くだけでは読まない」`inject_recheck.py` 冒頭 L11-16）に反する。

**前提・崩れる条件:** `alsoAffects` を付ける運用が回ること。**書き手が付け忘れる前提**で、週次で他エージェントの `recheck/` を横断して見る自動点検（件数のみ）を段階5で足す案を残す。

### (d) 状態の持たせ方: 「最終確認日・対象期間・確認失敗」（2026-10-06 追記）

背景: Codex の指摘。`[]`（確認して該当なし）と「ファイル無し」（未確認）の区別だけでは、**いつの確認か**が分からない。古い `[]` が現在も確認済みであるかのように読まれる。確認の実行が失敗した週も、今は表現できない（失敗の記録が無い）。

**採る案（提案）:** 項目配列とは別に、号ごとの状態を持たせる。

| フィールド | 意味 |
|---|---|
| `checkedAt` | 最終確認日（ISO 日付） |
| `period` | 確認の対象期間（{start, end}）。公式 changelog のどの範囲を見たか |
| `checkFailures` | 確認に失敗した出典の一覧（出典 id と理由）。失敗があるとき、`[]` を「該当なし」と読ませない |

置き場所は未決定。**現行の `recheck/<号>.json` は配列そのもの**で、`finalize.mjs`・`validateRecheck`・`emit-work-reverse-index.mjs` がすべて配列を前提にしている。配列を object へ変えると契約が壊れる。選択肢は次の2つで、どちらを採るかは**ユーザー判断**:

- (i) 横に別ファイル `recheck/<号>.status.json` を置く（既存契約に触らない。ファイルが2つになる）
- (ii) 配列を `{ status, items }` へ変える（1ファイル。`finalize.mjs` と契約テストの同時修正が要る）

**決定（2026-10-06・ユーザー承認）:** (i) を採る。状態（`checkedAt` / `period` / `checkFailures`）は別ファイル `recheck/<号>.status.json` に置く。
- 理由: 既存契約（`recheck/<号>.json` は配列。`finalize.mjs`・`validateRecheck`・`emit-work-reverse-index.mjs`・`tests/finalize-contract.test.mjs` が前提）に触れずに済む。
- 見送った案: (ii) 配列を `{ status, items }` へ変える。契約テストと `finalize.mjs`（Dev_hub 側スキル）の同時修正が要るため。
- 実装は段階2以降で、**今回は実装していない**。`.status.json` の置き場所だけが決まった状態（スキーマ詳細・古さの閾値は未決定）。

注入 MD にも「最終確認日・対象期間・確認失敗」を1行で出し、古い `[]` が現在の確認済みに見えないようにする。確認から何日を過ぎたら「古い」と明示するかの閾値は未決定（記録なし）。

### (e) 「候補」と「採用済みの行動ルール」を別セクションにする（2026-10-06 追記）

背景: Codex の指摘。注入ファイルの中で、**まだ採用していない提案が指示として実行される**事態を避けたい。今の `latest-recheck.md` は「関連する話題が出たら、記憶ではなくこの提案を優先する」と書いており（`emit-recheck.mjs` の冒頭文）、提案を採用済みのように扱わせる側に倒れうる。

**採る案（提案）:** 注入ファイルを2節に分ける。

- 「採用済みの行動ルール」: 既存の `rules/`・`AGENTS.md` の本体。**この機能では書き換えない**。
- 「提案（候補・未採用）」: 本機能が注入する部分。冒頭に「これは候補であり、採用されるまで指示として実行しない。採用はユーザー判断」と明記する。

見送った案: 提案を採用済みルール節に混ぜ、status だけで区別する。読み手（エージェント）が status の意味を読み飛ばしたとき、候補が指示として働くため。

**実施済み（2026-10-06・ユーザー承認）:** 冒頭文のみ先行して変更した。`emit-recheck.mjs` の「記憶ではなくこの提案を優先する」を「提案は候補であり、採用済みのルールではない。関連する話題が出たら、記憶より先に参照して判断材料にするが、採用するかは別に判断する」へ（旧形式側の「この再判定を優先する」も同趣旨に）。2節構成への分割そのものは未実施。**（訂正 2026-10-06: 下の「注意」の『今回の実装では変えていない』は、この冒頭文変更が実施済みであることと矛盾していた。実物の `emit-recheck.mjs` は変更後の文面になっている。Claude の出力が変わった唯一の文面変更はこの冒頭文で、段階0〜3 の本体は出力不変。）**

**注意（Claude の既存出力との衝突）:** 段階0〜2の受入条件は「Claude の `latest-recheck.md` の中身が変わらないこと」。この冒頭文の変更は Claude の出力を変える。この文面変更は段階0〜3 の実装とは別に先行で入れたもので、以後の段階の一致確認は変更後の文面を基準にしている。Codex 以降の新規注入ファイルは最初から2節構成にできる。

### (f) 予算はエージェント別（2026-10-06 追記）

背景: 注入に使える量がエージェントごとに大きく違う。`MAX_CHARS = 12000` 一律の発想は成り立たない。

| エージェント | 予算 | 出典の種別 |
|---|---|---|
| Claude | 12000 字（`inject_recheck.py` L68。提案本文と `claude-update/latest.md` の合算） | 実測（コードを読んだ） |
| Codex | **置換後の AGENTS.md 全体** 16 KiB（`sync-global.mjs` L88 の `MAX_AGENTS_BYTES`。管理ブロック単体の上限ではない。§9 で訂正）。AGENTS 指示合計の標準上限は 32 KiB（`codex-update/latest.md` に公式出典付き fact として記録済み。数え方・超過時挙動は未確認） | 前者はコードを読んで実測。後者は fact 記録まで確認 |
| Agy | ルール1ファイル 24 KB（超過分は行境界で切り捨て）、ルール全体で約 20,000 トークン（超過分はオンデマンドのファイルポインタへ降格） | Agy の自己申告。**未検証** |
| Hermes | MEMORY.md 約 2,200 字 | Hermes の自己申告。**現行 MEMORY.md は 2,278 文字で、すでにこの値を超えている（実測）** |
| Copilot | 不明（CLI ヘルプにサイズ上限の記載なし） | Copilot の回答 |

**上限順序（自分の項目を優先し、他エージェント項目から先に落とす）が最小予算でも成立するか:** 次の描画順で成立する。

1. 固定部（見出し・最終確認日の状態行・全エージェントの件数索引 1行）。**必ず出す**。Hermes の 2,200 字でも固定部は約 200 字で収まる想定（**未計測**）。
2. 自分の項目（優先順に、収まる分だけ。収まらない項目はタイトルと参照先パスだけに縮める）。
3. 他エージェント由来の項目（残りがあるときだけ。無ければ件数と参照先パスだけ）。

固定部が予算に収まらないときは**黙って切らず、生成を失敗させる**（Agy の「24 KB 超は行境界で切り捨て」のような黙った切り捨てに頼らない）。Hermes のように予算がほぼ尽きている環境では、**他エージェント由来の項目は 0 件**が正しい姿になりうる。

**未検証:** 各固定部の実際の文字数、Agy の「ルール全体 20,000 トークン」のうち既存ルールがすでに使っている量、Hermes MEMORY.md の空き（現状 2,278 文字）。

### (g) 他エージェント由来の「3件上限」はエージェント別にするか（2026-10-06 追記）

背景: Copilot は「3件上限では重要な影響を取りこぼしうる」、Hermes は「予算が極小」、Agy は「他社分は最小限に」と、方向の違う意見だった。

**結論（提案）:** 固定の3件ではなく、**エージェント別の上限を持つ**。既定値は (f) の予算から決め、運用で調整する。

| エージェント | 他エージェント由来の上限（案） | 理由 |
|---|---|---|
| Claude / Codex | 3件 | Claude は 12000 字枠に余裕が少ない（§9(d)）。Codex は AGENTS.md 全体 16 KiB 中の空きが約 5.2 KiB（§9(a)）で、いずれも「余裕がある」とは言えない。当初案の3件は仮置きのまま |
| Agy | 3件以下。まず 1〜3件で運用 | 常時ルールにトークン予算がある（Agy 自身の意見） |
| Hermes | 0件（索引1行＋参照先パスのみ） | MEMORY.md が 2,200 字制で、現状すでに超過（実測）。項目を足す余地が無い |
| Copilot | 未決定 | 注入先自体が未確認。「取りこぼしを懸念」は、上限を超えた分を件数と参照先パスで示す仕組み（既に設計に含む）で緩和できるかを、注入先が決まってから見る |

重要度の選別（上限に入れる優先順）は、status を使う案（例: 追従が必要 > 回避策の撤去 > 改善提案）がありうるが、**私の仮置きで、根拠となる運用実績は無い**。

見送った案: 全エージェント一律の3件。Hermes では実質入らず、Claude/Codex では余裕を使えず、どちらにも合わないため。

## 4. 実装の段階と、各段階で壊れうる箇所

**各段階はそれぞれ単独でマージ可能で、Claude の `latest-recheck.md` の中身が変わらないこと（段階0〜2）を受入条件にする。**

### 段階0: 検証ロジックの切り出し（挙動不変）— **実装済み（2026-10-06）**

実装メモ: `recheck-lib.mjs` に `validateRecheck` と定数群・`resolveRecheckLink`（`sourceUrlById` ごと）を移し、`build.mjs` は同じ名前を**再 export**した。`emit-recheck.mjs` L40 の重複定義 `HARNESS_PROPOSAL_SINCE` は `recheck-lib.mjs` の import に一本化。`build.mjs` の import 時の全件検証（`recheckByIssue` を作るループ）は `build.mjs` に残してある。併せて `recheck-lib.mjs` に `loadRecheckByIssue()`（段階1用の読み込み）を足した。

- `validateRecheck` と定数群（`HARNESS_*`・`isHarnessProposalIssue`・`recheckSectionLabel`・`resolveRecheckLink`、`build.mjs` L79-136）を `recheck-lib.mjs` へ移し、`build.mjs` から**再 export** する。`HARNESS_PROPOSAL_SINCE` の重複（`emit-recheck.mjs` L40）を解消する。
- 壊れうる箇所:
  - `build.mjs` を import する `finalize.mjs`（申し送り §2-1「import 時に全件検証される」）。再 export しつつ import 時の検証を維持しないと**検証が空振りする**（`tests/finalize-contract.test.mjs` が捕まえる）。
  - `build.mjs` L81 `sourceUrlById` が `requiredSources` に依存。切り出し先でも同じ解決をする。
  - `tests/recheck-radar.test.mjs`（`recheck` 言及29件）・`tests/report-structure.test.mjs`（10件）の import 先。

### 段階1: 注入 MD を JSON から直接生成（Claude のみ）— **実装済み（2026-10-06）**

実装メモ: `emit-recheck.mjs` は `recheck/*.json` を `loadRecheckByIssue()` で読む。HTML は「その号が存在するか」（`<号>.html` の有無）の判定にだけ使い、中身は読まない。**一致確認:** 変更前の `latest-recheck.md` を退避し、新方式で再生成して `diff` したところ**差分ゼロ**（2026-10-04 号・5件、生成日も同日のため全行一致）。範囲: 通した条件は現行データ（v2 形式の最新号が 2026-10-04 の1通り）のみ。**v1 形式が最新号の場合・0件の号の場合の出力は実データでは未比較**（0件・v2 の経路は `tests/finalize-contract.test.mjs` が一時ディレクトリで通している）。`tests/finalize-contract.test.mjs` の `emit()` は、`emit-recheck.mjs` だけを一時ディレクトリへ複製していたため、`recheck-lib.mjs`・`sources.mjs` の複製と `recheck/<号>.json` の書き出しを足した（契約そのものは変えていない）。

- `emit-recheck.mjs` を、`recheck-lib.mjs` 経由の `recheck/<号>.json` 読み込みへ置き換える。HTML 正規表現（L13-25）を廃止。
- 受入: **現行出力と 2026-10-04 号で一致**（`latest-recheck.md` の差分ゼロ。生成日行を除く）。
- 壊れうる箇所:
  - `emit-recheck.mjs` L79-81 の「未確認の号」判定は HTML 存在が根拠（JSON 化で意味がずれうる: HTML が無い号や、`pageStatus` が生成済みでない号）。
  - `finalize.mjs` の照合3点（`対象号:` 行・「更新なし」・`## [status] title`）。書式を1文字でも変えると落ちる（契約テスト）。
  - L93 の `await import('./emit-work-reverse-index.mjs')`（逆引き生成が一緒に走る副作用）は維持する。
  - 同時に動かす `emit-work-index.mjs` との順序（README L28）。

### 段階2: `agent` / `alsoAffects` の任意フィールド追加（既定値で Claude 扱い）— **実装済み（2026-10-06）**

実施内容・採った解釈・外部添削・確認の範囲は末尾の「段階2 実施記録」を参照。

- `validateRecheck` が `agent`（既定 `claude`）と `alsoAffects`（既定 `[]`）を受理して戻す。`work` / `workComment` も同時に検証対象へ入れる（現状は素通しで、`emit-work-reverse-index.mjs` L44-55 が別系統で読んでいる。**検証が二重に分かれている**のを解消）。
- **検証失敗の扱いを決める**: 現状は不正ファイル1つで build 全体が止まる（L141-143）。「他エージェントのファイルが不正でも Claude と記事は止めない（警告）」にするか、現状どおり止めるかは要判断（§5）。
- 壊れうる箇所: `build.mjs` L129-133 の v2 厳格検証（`status` / ラベル順）に `agent` を絡めると、過去号の項目が落ちる。**過去ファイルは書き換えない**（README の方針）ため、既定値の補完で吸収する。

### 段階3: 他エージェント提案の置き場と読み込み — **実装済み（2026-10-06・描画は HTML に載せない解釈）**

実施内容・採った解釈・親セッションの決定・外部添削・確認の範囲は末尾の「§8 段階3 実施記録」を参照。以下の元の記述（HTML 小見出し案・feedbackCount・記事台帳等）は**採らなかった案**として残す。

- `recheck/codex/<号>.json` を読む。号 HTML の枠は、`recheck-radar` セクション内にエージェント別の小見出し（例: 「ハーネス改善提案（Codex）」）として追加する案。
- 壊れうる箇所:
  - `build.mjs` L328 `feedbackCount = count + (recheckItems ? 1 : 0)`: フィードバック対象の数え方（エージェント別に増やすのか、1枠のままか）。
  - `build.mjs` L511-526: 記事台帳の登録は号ごと1件（§3(c)で1件のまま）。
  - `build.mjs` L566-577: 未確認号の警告は `recheckByIssue.has` の1系統。エージェント別の警告を足す必要。
  - `emit-recheck.mjs` L27-34: HTML 側に radar が複数セクションを持つ場合の抽出。
  - `apply-theme.mjs` L19・L59 の CSS（`.recheck-*` クラスを流用する限り不変）。
  - `relevance.mjs` L97 の項目（1件のまま）。

### 段階4: Codex への注入統合

- `latest-recheck-codex.md` を JSON から生成し、`codex-update/sync-global.mjs`（`renderGlobalBlock`・上限 `MAX_AGENTS_BYTES = 16 * 1024`）の管理ブロックへ載せる、または `inject.mjs` の出力に足す。
- **（§9 で方針変更。以下は元の記述）** 壊れうる箇所: `~/.codex/AGENTS.md` の管理ブロックは**全体を再生成して置き換える**（マーカー必須）。マーカーが重複・片欠けだと中断する（`sync-global.mjs`）。Codex の既定上限（32 KiB はプロジェクト指示との合計）に近づくと**ブロックが読まれない／切られる**恐れがある。書き込み先は `~/.codex`（変更権限は §5）。
- `record-hit.mjs` の参照記録と整合させる（`recheck-hits.jsonl` は Claude 側が `record_recheck_hit.py` で書く別系統）。

### 段階5: 相互参照と点検

- `alsoAffects` を受けた「他エージェント由来」節と、全エージェントの件数索引行を各注入ファイルに足す（上限つき）。
- 週次の件数点検（未確認・付け忘れの検出）。
- 壊れうる箇所: 注入サイズ（Claude の `MAX_CHARS` は提案本文と `claude-update/latest.md` の合算 L185）。節を足すと、**他社分が先に削られる**順序を確実にしないと、Claude 固有の提案が押し出される。

### 段階6（任意）: Claude も `recheck/claude/<号>.json` へ移す

Dev_hub 側の `finalize.mjs` と契約テストを同時に更新できる時にだけ。必須ではない。

## 5. 未検証事項・要ユーザー判断事項

### 要ユーザー判断

6. **（2026-10-06 追記）展開順序:** Agy の意見は「Claude → Codex → Agy を先に成立させ、Copilot と Hermes は後」。根拠は「どのエージェントにも提案を書く担当・生成プロセスが無い段階で、Copilot・Hermes まで含めた多者間の相互参照を先行して設計するのは過剰」。私の見立て: 注入先が未確認の Copilot と、MEMORY.md に空きの無い Hermes（§3(f)）を後に回す根拠は実測でも裏づく。ただし Agy の自己申告（hook の有無・サイズ）は未検証で、**Agy は自分を先行グループに入れる側でもある**点は割り引いて読む。**順序は私の提案であり、ユーザーは未決定。**
7. **（2026-10-06 追記）提案を誰が書くか（項2 を全エージェント共通の未解決事項へ拡張）:** Codex・Agy・Copilot・Hermes のいずれにも、recheck 相当の提案を週次で書く担当（スキル・自動化）が現状無い。Agy も同じ指摘を「穴」として挙げた。Claude は self-update-check スキルが書いているが、他は「どのエージェントが、どの出典を、いつ、誰の承認で」書くかが未決。注入の仕組み（段階2〜5）は書き手が決まるまで空回りする。
8. **（2026-10-06 追記）状態ファイルの置き場所:** **決定済み（2026-10-06・ユーザー承認）: (i) 別ファイル `recheck/<号>.status.json`**（§3(d)）。実装は段階2以降。

1. **公開範囲（設定変更なので提案のみ。実施はユーザー）:** ルートの `.assetsignore` に `recheck/` `latest-recheck.md` `weekly-updates/` を足すか。`claude-update/` `codex-update/` `recheck-hits.jsonl`（参照記録の自由記述 note を含む）も同じ観点。
   - 事実: Worker は Firebase 許可 UID で保護されており（`firebase-auth-poc/worker.mjs`）、未認証では見えない。号 HTML には提案本文がそのまま載っているため、`recheck/*.json` を足しても**認証済み閲覧者に見える内容の増分は小さい**可能性が高い（HTML と JSON の差分は未比較）。`weekly-updates/` は絞る前の全件控えで、HTML に載らない分が増える。
   - これを判断すべきか否か自体を含めて、ユーザーが決める。本メモでは変更しない。
2. **他エージェントの提案の書き手**: Codex・Gemini の self-update 提案（recheck 相当）を誰がいつ書くか。現状 Codex 側に当該自動化もスキルも無い（§2.3 追加4・5）。`technews-weekly` 自動化に載せるか、新規の定期タスクにするか、手動か。
3. **不正ファイルの扱い**: 他エージェントの `recheck/<agent>/<号>.json` が不正なとき、build 全体を止めるか、警告にして他を通すか（段階2）。
4. **`alsoAffects` の運用**: 書き手が付与する形でよいか。
5. **外部添削を通すか**: 新しい設計判断（出力単位・注入単位・相互参照）を含み、複数ファイルの整合（build/emit/inject/finalize/契約テスト）が絡む。自己チェックで不安が残るのは、段階1の出力一致と段階4の `AGENTS.md` 上限。**添削を通すかはユーザー判断**。

### 別件（本メモの設計とは別に見つかった事項。**修正はしていない**）

- `ask-hermes` の SKILL.md（`F:/Dev_hub/skills/claude/ask-hermes/SKILL.md` L21・L39、`run.ps1` L9、`run.py` L14、`skills/codex/ask-hermes/run.ps1` L4）が `-m gemini-3-flash-preview` を固定している。モデル名が古い可能性。**どのモデルが現行かは未確認**（私の知識は学習カットオフまでで、Hermes 側の利用可能モデルを確認していない）。直すかはユーザー判断。
- Agy 用の ask スキルが `F:/Dev_hub/skills/` に見当たらない（`ask-*` は codex / copilot / hermes / deliberate のみ）。今回の相談は別経路で呼んだ。常用するなら要整備。
- `docs/superpowers/specs/2026-09-18-technews-private-auto-publish-design.md` L99 は「`firebase-auth-poc/wrangler.toml` / `.assetsignore`」と並べて書いており、`.assetsignore` が `firebase-auth-poc/` にあるように**読める**。実際に効くのは**ルート直下**の `.assetsignore`（`firebase-auth-poc/` には無い。2026-10-06 に `ls -a` で確認）。§2.3 訂正5 のとおり。当該設計書は今回直していない。

### 未検証・未確認

- **`~/.codex` 側の書き込み可否と対象**: `~/.codex/AGENTS.md` と `~/.codex/hooks.json` は**実在を確認**した。ただし本メモで確認したのは読み取りまで。AGENTS.md の管理ブロックは生成日 2026-09-11 のスナップショットで、**その後の更新（`sync-global` の再実行）は確認していない**。`hooks.json` の SessionStart が `codex-update` を呼んでいるかは `grep` で該当なし（`recheck` `technews` `codex-update` を含む行なし）。Codex の hooks は信頼登録が要る仕様（`codex-update/facts.json` の fact）で、AGENTS.md 経由を選んだ経緯と整合する。
- **`~/.gemini` 側**: ディレクトリと `GEMINI.md` は実在。ただし `GEMINI.md` 内の記述は `F:\Gemini_Env` への言及が中心で、**`~/.gemini` が Gemini CLI と Agy CLI のどちらの持ち物か（あるいは両方か）を確認できていない**。`F:/Gemini_Env/` は Agy 領域で触らない前提のため、Gemini 向けの注入先・提案が当たる対象ファイルは**「未確認」**。Gemini 側の注入方式は本メモでは決めない。
- Codex 提案が当たる対象ファイル（`~/.codex/AGENTS.md`・`~/.codex/config.toml`・`hooks.json` 等）は実在するが、**提案を当てる際の編集可否・同期コピーとの正本関係**（`codex-update` が AGENTS.md の管理ブロックを生成物として上書きする）は個別に確認が必要。管理ブロックの内側は手編集しない。
- **段階1の出力一致**: 2026-10-06 に実施し、2026-10-04 号（v2・5件）で差分ゼロ（§4 段階1）。**未検証:** v1 形式が最新号の場合、0件の号の実データ、複数号が同日に追加された場合。
- `latest-recheck.md` の文字数と `MAX_CHARS` の関係（17042 バイトの文字数換算）は未計測。
- 本メモの「見送った案」の多くは、本メモ作成時の比較検討であり、**過去にその案を検討して落とした記録は無い**。既存の設計書（`2026-09-10-claude-update-design.md`）は他社 CLI の更新を「本命の週次記事が扱う」として外す（L34）と書くが、**self-update を Claude 以外へ広げる検討をした記録は見つからなかった（記録なし）**。
- 無人の週次実行で、各エージェントの提案生成から `build.mjs` → `emit-*` までが通るか（申し送り §5 のとおり手動実行のみの確認）。

### 記録上の注意

- 本メモは推測で「なぜ」を埋めていない。既存の設計判断の理由が残っていない箇所は「記録なし」と書いた。
- 「確認した」範囲: 上記ファイルの**読み取りのみ**。実行・変更・git操作は行っていない。

## 6. 2026-10-06 の相談結果と、私のレビュー

相談先: Codex / Copilot / Agy / Hermes（回答は `C:/Users/Owner/.claude/tmp/ai-consult-selfupdate/`）。ユーザーは就寝中で、判断を仰がず進めてよいとの指示だった。**外部の回答は自己申告であり、以下は鵜呑みにせず区別して反映した。**

### 採った点と根拠

- 状態（最終確認日・対象期間・確認失敗）を持たせる（Codex）→ §3(d)。古い `[]` が確認済みに見える問題は、私も §2 の「`[]` と未生成」の設計から導ける穴だった。
- 候補と採用済みの分離（Codex）→ §3(e)。現行の `latest-recheck.md` 冒頭文が実際に「この提案を優先する」と書いているのを確認した上で採った。
- エージェント別の注入経路（Agy / Hermes / Copilot）→ §3(b)。
- エージェント別の予算と上限（Hermes / Agy / Copilot）→ §3(f)(g)。Hermes の MEMORY.md が実測で 2,278 文字ある点は、回答に無かった私の追加確認。
- JSON を正本にして MD を直接生成する方針は、Codex・Copilot・Hermes がそろって妥当と回答。**ただし全員が私の提示した前提文を読んで答えており、独立した裏づけではない**（相談は私の設計案を渡して行ったため、追従バイアスの可能性がある）。

### 採らなかった・保留にした点

- Agy の「Copilot・Hermes を含む多者間の相互参照の先行設計は過剰」: 展開順序の根拠としては取り込んだが、**決めたのではなく提案**（§5 項6）。
- Hermes の「全提案を即時に常時注入しない」: 方針としては同意（§3(f)(g)）。ただし MEMORY.md が実際に空きの無い状態という事実で裏づけた上で採った。
- Copilot の「3件上限では取りこぼす」: 注入先が不明なため結論を保留（§3(g)）。

### 確認の範囲（「確認した」に含めない条件を明記）

- **読んで確認した（実測）:** 本リポの `build.mjs` / `emit-recheck.mjs` / `recheck-lib.mjs`、`~/.codex/AGENTS.md` の管理ブロックの実在（`~/.codex` は読み取りのみ）、Hermes の `MEMORY.md` の文字数、ルート `.assetsignore` と `firebase-auth-poc/` の内容、`ask-hermes` スキルの記述。
- **各エージェントの自己申告で、未検証:** Agy の hook 一覧・24 KB・20,000 トークン・`config.json` の保護、Codex の 32 KiB と hook 信頼登録、Hermes の 2,200 字と「hooks ディレクトリが見つからない」、Copilot の指示ファイル候補。
- **権限エラーで読めなかった:** Codex・Copilot は一部のファイル読み取りに失敗しており、(d) の回答は渡された文脈・ヘルプに基づく。
- **過去の検討記録:** Codex 以外へ self-update を広げる検討をした記録は無い（記録なし）。この点は §5 のとおり変わらない。

## 7. 段階2 実施記録（2026-10-06）

### 実施内容
- `recheck-lib.mjs` の `validateRecheck` に任意フィールドを追加。戻り値に `agent`（省略時 `claude`）と `alsoAffects`（省略時 `[]`）を常に含める。`work` / `workComment` は指定があるときだけ型を検証し、戻り値にも残す。定数 `RECHECK_AGENTS` / `RECHECK_ALSO_AFFECTS_MAX` を export。
- テスト `tests/recheck-agent.test.mjs`（9件）を新規追加。

### 採った解釈（メモの記述が曖昧だった点）
- **agent の許可値**: メモは §3(c) で `claude / codex / gemini / all`、§3(b) で Claude・Codex・Agy・Hermes・Copilot と、名前の集合が一定でない。注入経路の表に出る全員の閉じた集合 `claude, codex, agy, copilot, hermes` とした（当初案は gemini を含んでいたが、Gemini CLI 廃止・後継 Agy CLI とのユーザー指摘で 2026-10-06 に除外。ユーザーが推奨どおりと承認）。`all` は出典台帳向けの値で、提案項目の書き手を表さないため入れない。タイプミスを黙って通さないための閉集合。**集合そのものはユーザー未決定で、増減は `RECHECK_AGENTS` の1行**。
- **alsoAffects の形式**: 許可値の配列、重複なし、**自分自身（agent）を含まない**、最大5件（= 自分以外の人数。重複なし・自分除外の下では自然な最大値と同じで、独立の制約としては冗長。メモに件数上限の値が無いため、明示の上限として置いた）。メモの「他エージェント由来 3件上限」は注入側（段階5）の話で別物。
- **v1・v2 の両方で agent を受理**する（v2 のみ、とはしない）。過去ファイルを書き換えない方針で、既定値の補完で吸収。
- **work / workComment**: メモ段階2に含まれるため実装。ただし「検証の二重化の解消」は部分的。型だけ検証し、`relevance.mjs` の workMap キー存在検査は `emit-work-reverse-index.mjs` に残す（循環依存を避けるため）。同ファイルは引き続き生 JSON を直読みする。
- **status.json は実装していない**（段階2の記述に含まれない。§3(d) の決定どおり「段階2以降」の別項目）。
- **検証失敗の扱い（不正ファイル1つで build 全体停止か警告か）は決めていない**。現状の「throw で停止」のまま。他エージェント用ディレクトリが存在しない段階2では分岐が実在しないため。§5 項3は未決のまま。
- 不正値の扱い: `agent: null` / `alsoAffects: null` を「省略」と同一視しない（`??` を使うと黙って claude 扱いになる穴が、テスト先行の段階で見つかったため `=== undefined` で判定）。

### 外部添削（Codex・read-only、2026-10-06）
前提事実を添えて実施。1回目は `recheck-lib.mjs` が未追跡で `git diff` が空になり、差分本文を渡せなかったため Codex は「実装差分の本文が無い」と回答（有効な指摘ではなく、やり直した）。2回目は全文を埋め込み。全文は `C:/Users/Owner/.claude/tmp/stage2-codex-review.txt`。Codex 側もローカルコマンドが拒否され、テスト・finalize.mjs 実物は未確認と自己申告している。

| 指摘 | 採否 | 理由 |
|---|---|---|
| 既存全件テストが `agent==='claude'` を無条件に要求し、将来の正当な codex 項目で落ちる（中） | 採用 | その通り。生 JSON の `agent ?? 'claude'` と比較する形に修正 |
| work/workComment の検証追加が従来受理した入力を拒否しうる（中） | 部分採用 | 既存 7 ファイルは全件通ることをテストで確認。厳しくなる点（`work` が配列以外・空文字要素）はメモ段階2の意図どおりで、実データ上は影響なし。ただし**将来の週次出力が従来緩かった形で書かれたら build が止まる**ことは残る（未検証） |
| 新フィールドが finalize / emit / 逆引きまで届くかのテストが無い（中） | 一部採用 | 逆引きは検証済み `work`/`workComment` と生 JSON の一致をテスト化。emit-recheck は agent を出力しない設計で、`latest-recheck.md` の完全一致で確認（別テストは足さない）。`finalize.mjs` は未変更で契約テスト通過のみ。finalize 経由の保存保持テストは、同スクリプトが Dev_hub 側の別リポで本リポのテストから呼べないため見送り |
| 件数上限テストが重複検査でも通り、上限の独立性を証明しない（低） | 採用 | 件数検査を別 throw にしメッセージ「最大」で識別 |
| 境界テスト不足（`work:null`/空白要素、`workComment:null`、hasOwn、全エージェント組合せ、v1 の検証）（低） | 採用 | テスト追加 |

### 確認の範囲
- **通した条件**: 新規9テスト通過。全体 213 件中 210 通過、失敗3件は既存（test 5・7・9。内容は触っていない）。`latest-recheck.md`・`work-reverse-index.md` は変更前に退避したものと `cmp` でバイト一致（2026-10-04 号・v2・5項目の1通りのみ。号をまたぐ複数号や、agent を持つ実データでの比較は無い）。`node build.mjs` は exit 0。
- **未検証**: `agent` を持つ実データ（実在しない）。`finalize.mjs` の実物を通した実行（契約テストのみ）。agent 別ディレクトリの読み込み（段階3）。Codex の指摘は単一モデルの1回の回答で、再現していない。

## 8. 段階3 実施記録（2026-10-06）

### 実施内容
- `recheck-lib.mjs` に `loadAgentRecheck(dir)` と `warnAgentRecheckFailures(failures)` を追加。`recheck/<agent>/<号>.json` を読み、`{ byAgent: Map(agent -> Map(号 -> 項目[])), failures: [{agent, file, issue, reason}] }` を返す。項目の `agent` を省略するとディレクトリ名の agent になる（明記が食い違えば不正）。
- `build.mjs` は Claude 分の読み込み直後に呼び、警告のみ出す（`export const agentRecheck`）。`emit-recheck.mjs` も警告のみ。`latest-recheck.md`・号 HTML・記事台帳・`emit-work-reverse-index.mjs` は他エージェント分を一切読まない。
- テスト `tests/recheck-agent-dirs.test.mjs`（10件）。

### 採った解釈（メモの記述が曖昧・不採用にした点）
- **段階3 の範囲 = 「置き場」と「読み込み・検証」だけ。「描画」は HTML に載せない。** メモ元記述は号 HTML の radar 内にエージェント別小見出しを足す案だった。ユーザーの意図（self-update は読者向け HTML にしない。Claude が読む判断材料）と、足せば `feedbackCount`・`recheckByIssue.has`・未確認警告・`emit-recheck` の抽出・`relevance.mjs` に波及する点から、最小解釈として載せない。HTML 小見出し案・`feedbackCount` の数え方・エージェント別未確認警告は**見送り**（実書き手が決まり、必要性が出てから）。
- 空配列 `[]` は Claude 本体と同じ「確認して該当なし」として受理する。
- 黙って捨てない: 号の名前でない `.json`、未知の agent ディレクトリ、`recheck/claude/`（Claude は直下）、ディレクトリ列挙の失敗も failures に入れる。`<号>.status.json`（§3(d) 決定済みの別ファイル）はスキーマ未実装のため読まず、失敗扱いもしない。`.json` 以外は無視。

### 親セッションの決定（2026-10-06 親セッションの判断。ユーザー未承認）
**他エージェント用ディレクトリのファイルが不正なら、ビルド全体を止めず警告を出してそのファイルだけ除外し、その事実を「確認失敗」として残す。Claude 本体（`recheck/<号>.json`）が不正なときは従来どおり throw で停止する。** ディレクトリ名と agent の食い違いは不正（警告・除外）。§5 項3 に対する暫定の答え。
- 理由: 書き手が別（§3(a)）なので、他エージェントの書き損じで TechNews 全体と Claude の提案注入を止めない。一方 Claude 本体は finalize.mjs の契約があり、静かな欠落のほうが危険。
- 見送った案: (a) 全体停止のまま — 未決定の書き手1人の不正で週次の公開・Claude 注入まで止まる。(b) 他エージェントも警告のみで failures を持たない — 「該当なし」と「読めなくて欠落」が区別できなくなる。
- 崩れる条件: 警告が誰にも見られない運用では除外が見逃される（下記「確認失敗の永続化」）。

### 外部添削（Codex・read-only・全文埋め込み、回答全文 `C:/Users/Owner/.claude/tmp/stage3-codex-review.txt`）
| 指摘 | 採否 | 理由 |
|---|---|---|
| 高: `readdir(subdir)` が try/catch の外でディレクトリ単位の I/O 失敗が build を止める | 採用 | agent ディレクトリの列挙失敗も failures に入れて継続するよう修正。**権限エラー等の実際の I/O 失敗を起こすテストは無い**（Windows で再現困難で見送り） |
| 高: 確認失敗が成果物に残らず、stderr が見られないと分からない | 部分採用（残件） | 戻り値 failures は §3(d) の checkFailures へ繋がる形にしたが、永続化は未実装。置き場（`.status.json`）のスキーマが未決定で、段階4の注入ファイルと一緒に決めるべきため。**「確認失敗として残す」は現状 警告出力＋戻り値までで、成果物には残らない**。ユーザー判断事項 |
| 中: emit の統合テストが逆引き生成まで通らず、status も見ていない | 見送り | 一時ディレクトリに `emit-work-reverse-index.mjs`（relevance・HTML 依存）を複製できない。実リポで `emit-recheck.mjs` 全体を実行し exit 0・既存出力のバイト一致は確認済み |
| 中: build の後方互換・HTML 非掲載を、他エージェントデータがある状態で見るテストが無い | 見送り | `build.mjs` は import.meta.url 固定で `recheck/` を読み、フィクスチャに差し替えられない。実リポへ codex ファイルを作るのは禁止。build 側の変更は2行（呼び出しと警告）で、HTML 描画は `agentRecheck` を参照しない（コードを読んで確認）。未検証として残す |
| 中: メモの段階3記述が現決定・実装と食い違う | 採用 | 段階3見出しと冒頭に実施済み・不採用案の旨を追記 |

### 確認の範囲
- **通した条件**: 新規10テスト通過（正常読み込み・agent 省略／明記・食い違い・不正内容／壊れた JSON／非配列・名前不正／未知 agent／claude ディレクトリ・Claude 不正は throw・他エージェント不正が Claude 読み込みに波及しない・ディレクトリ無し・実リポに他エージェント分が無い・emit-recheck の出力一致と警告）。全体 223 件中 220 通過、失敗3件は既存（test 5・7・9。内容は触っていない）。`node build.mjs`・`node emit-recheck.mjs` は exit 0、`latest-recheck.md`・`work-reverse-index.md` は変更前の退避と `cmp` でバイト一致（2026-10-04 号・v2・5項目の1通り）。`finalize-contract.test.mjs` 通過。
- **未検証**: `build.mjs` を他エージェントデータがある状態で実行した結果（HTML・feedbackCount・記事台帳が不変であること）。実際の I/O 失敗（権限・列挙後消失）。`finalize.mjs` 実物を通した実行。`recheck/claude/` 以外で `agent` が `codex` の項目を Claude 直下ファイルに書いた場合（検証は通り、Claude の `latest-recheck.md` に載る。ディレクトリ名を正とする §3(a) の方針と未整合。直下の agent 値制限は未実施）。実データの他エージェント提案は存在せず、実運用での挙動は未確認。

## 9. 助言の突き合わせと、段階3以降の追加実装（2026-10-06 親セッションの判断。ユーザー未承認）

背景: ユーザーが「Codex や上位モデルから助言をもらいつつ、残件含めて進めて」と指示し、判断を仰がず完了まで進めてよいとした。助言は Codex（`C:/Users/Owner/.claude/tmp/advice-codex-r2.txt`）と上位モデルのレビュー（親セッションからの要約として受領）。**どちらも単一モデルの回答で、私が再現した助言ではない。** 以下の採否は親セッションの判断で、ユーザー未承認。

### 実装した内容（コード・テスト）

| # | 内容 | 場所 |
|---|---|---|
| P1 | Claude 直下 `recheck/<号>.json` の `agent` は `claude` か省略のみ。他は throw。`build.mjs` の独自ループを廃止し `loadRecheckByIssue` に一本化 | `recheck-lib.mjs`, `build.mjs` |
| P2 | `validateRecheckStatus` / `loadRecheckStatuses` / 純関数 `deriveCheckState` / `checkAge` / `latestIssue`。build 時の検証失敗は status.json へ書き戻さない（毎回計算し直す派生物） | `recheck-lib.mjs` |
| P3 | `renderAgentRecheckMd` と `emit-recheck.mjs` からの `latest-recheck-codex.md` 生成。**`recheck/codex/` が実在するときだけ**作る | `recheck-lib.mjs`, `emit-recheck.mjs` |
| P4 | `finalize.mjs` が `build.mjs` の `agentRecheck.failures` を warnings へ入れる | `F:/Dev_hub/skills/claude/self-update-check/scripts/finalize.mjs`（内容編集のみ） |

### 採った解釈（メモ・指示が曖昧だった点）

- **status.json の `period`**: 形式の指定が無かったため `YYYY-MM-DD` の実在日付・`start <= end` とした。`checkedAt` は指示どおりタイムゾーン付き ISO 日時。`sources` は1件以上必須（出典ゼロを「確認済み」にしない）。`reason` は任意だが、あれば文字列。
- **状態の優先順**: 提案 JSON が除外された（確認不能）を最優先。JSON 無し＋status だけある場合、および JSON 有り＋status 不正は「状態不明」。メモの状態一覧にこの2通りの記述は無く、最小の解釈として「該当なし」にも「未確認」にも倒さない側を選んだ。
- **全出典失敗で提案 JSON に項目がある**場合: 状態は「確認失敗」、Markdown に項目は出さない（確認が成立していない結果を提案として注入しない）。
- **「最新号」**: 実在する号（`<号>.html`）の最大。Claude 側の既存ロジック（JSON を持つ号の最大）は変えていない（Claude の出力をバイト一致で維持するため）。このため Claude と Codex で「最新号」が異なる日がありうる（Codex 側は最新の実在号に Codex の確認が無ければ「未確認」と出す）。
- **`latest-recheck-codex.md` を実リポに作るか**: `recheck/codex/` は現状無いため作らない（`.assetsignore` は未変更。`latest-recheck-codex.md` が将来できたとき公開範囲に入る点は §5 項1 のとおりユーザー判断）。「未確認」だけのファイルを今増やすと、書き手の無い状態の注入ファイルが先に生まれるため見送った。
- **`~/.codex` への書き込み・`inject.mjs` / `sync-global.mjs` への接続はしていない。**
- 古さの閾値は **14日・根拠なしの仮置き**（`STALE_DAYS`）。Codex 助言の「予定日＋3日／最終確認から10日」も根拠のない案で、採用していない。運用実績が出てから決め直す。

### (a) 訂正: 16 KiB の意味（§3(b)(f)・段階4の記述は不正確だった）

実測（`codex-update/sync-global.mjs` L88 を読んだ）: 16 KiB は管理ブロック単体ではなく、**置換後の `AGENTS.md` 全体のバイト数**で判定され、超えると同期を拒否する。`~/.codex/AGENTS.md` は 2026-10-06 に `wc -c` で **11,189 バイト**（読み取りのみ）。16,384 − 11,189 = **約 5.2 KiB（5,195 バイト）**が空き。管理ブロックへ提案本文を埋め込むと、この空きを使い切る恐れがある。

### (b) 32 KiB の出典

`codex-update/latest.md` L19 に、公式 AGENTS.md 文書の事実として「標準の合計上限は 32 KiB」と出典付きで記録済み（2026-09-10）。**数え方（バイトか文字か、どのファイルの合計か）と超過時の挙動は未確認。**

### (c) §3(e) の矛盾

上の §3(e) に訂正を埋めた（「実施済み」と「今回の実装では変えていない」が矛盾していた。実物は変更後の文面）。

### (d) Claude の注入予算

上位レビューは「11,325 字／12,000 字（残り約 675 字）」と申告した。**私の再計測は一致しない。** `inject_recheck.py` を実行して（読み取りのみ・出力を数えただけ）、注入全体 15,426 字、うち `latest-recheck.md` 本文 9,085 字、`claude-update/latest.md` 本文 1,522 字を得た（`wc -m` は日本語を文字でなくバイト寄りに数えたため使っていない。Node の `.length` で数えた）。上限判定は `len(body) > 12000`（L165。本文のみ）と、更新本文を足す前の `len(context) + len(update_body) <= 12000`（L185）の2箇所で、**注入全体の長さに掛かる上限ではない**。したがって「残り約 675 字」の算出方法は私には再現できず、**残り予算は未確定**。段階5で他エージェント行を足す前に、優先順に削る処理と、どの量に上限が掛かるかの再定義が要る。

### (e) 助言の要点と採否

| 助言 | 採否 | 理由 |
|---|---|---|
| Claude 直下は `agent: claude` のみ（Codex・上位モデル両方） | 採用（P1） | 誤配信の防止。既存 `recheck/*.json` 7件に `agent` / `alsoAffects` が無いことを確認済みで、後方互換を壊さない |
| `checkFailures` を別配列で持たず `sources` から導く（上位モデル） | 採用（P2） | 二重管理が食い違うのを防ぐ。Codex 案の `failures` との別建ては見送り |
| build の検証失敗を status へ書き戻さない（上位モデル） | 採用（P2） | build が status の書き手になる／過去の確認日時を書き換えるのを避ける |
| 古さを状態と別軸で重ねる（Codex・上位モデル） | 採用。閾値は仮置き | 閾値の根拠なし |
| 動的経路（`inject.mjs --text` の出力）にだけ提案を載せ AGENTS.md のスナップショットには入れない（`~/.codex` 書き込み0回） | **段階4の方針として採る**。実装は Codex の書き手の初回ファイルが出てから | 空きが約 5.2 KiB で、本文埋め込みは予算を食う。書き手が決まる前に接続しても空回りする |
| 書き手は C（Codex 用スキル）で開始し B（定期実行）へ移行（Codex 助言） | **採否保留**。ユーザー判断事項（§9(i)） | 「自分が最も環境を知っている」は根拠にならないと Codex 自身も書いている。新設スキル・自動化は今回の禁止範囲 |

### (f) 見送り

管理ブロックへの本文埋め込み／2つ目のマーカーブロック／Agy・Hermes・Copilot の経路／段階5の自動点検／段階6／HTML 掲載／`sync-global` への提案同梱／`proposalSha256`（Codex 案。過剰気味で、書き手が未決のため先送り）。

### (g) 新論点（未決として記録）

- 候補の採用・却下・保留の履歴が無いと、同じ提案を毎週作り直す（現状、採否を残す場所が無い）。
- `alsoAffects` は通知であって、相手側で適用を確認済みという意味ではない。
- 「予定の出典」の母集合の定義（`sources.mjs` のどれが Codex の確認対象か）が未決。Codex 助言は「予定した出典を確認できたこと」を「該当なし」の条件にしたが、母集合が定義されていないと `status.json` の `sources` が全成功でも網羅の証明にならない。

### (h) 事実

- Claude の週次は既に `sources.mjs` の `openai-chatgpt-codex-changelog` を読む。ただし 2026-10-04 号では期間内1件のみ、Codex CLI 個別リリースノートは未取得。
- facts 層（`claude-update/`・`codex-update/`）は 2026-09-06 号の1号以降、書き手が止まっている。
- Codex の `technews-weekly` は日曜 21:00 に `build.mjs` → publish を実行し、**この未コミットの作業ツリーのコードで build が走る**。段階0〜3 と本節の変更が既に載っているため、変更後に `node build.mjs` が通ることを確認した（exit 0）。

### (i) ユーザーにしか決められない事項

1. 他エージェント（Codex）の提案の書き手: Codex 本人の新規自動化か、当面置かないか。
2. `~/.codex/AGENTS.md` への書き込みを許すか（許さないなら動的経路のみ。上の方針のとおり）。
3. 拡大の条件（Agy・Copilot・Hermes を足す判断基準）。
4. Claude の不正（`recheck/<号>.json` の検証失敗）が記事公開（build）を止める結合を許容するか。現状は止まる。
5. `latest-recheck-codex.md` が将来できたとき、公開範囲（`.assetsignore`）に入ってよいか（§5 項1）。

### 確認の範囲（2026-10-06）

- **通した条件**: `tests/recheck-status.test.mjs`（新規）・`tests/recheck-agent-dirs.test.mjs`（P1 テスト2件追加）・`tests/finalize-contract.test.mjs` ほか既存を含む全体 242 件中 239 通過。失敗3件は既存（test 5・7・9。内容は触っていない）。`node build.mjs` exit 0、`node emit-recheck.mjs` exit 0。`latest-recheck.md`・`work-reverse-index.md` は変更前の退避と `cmp` でバイト一致（2026-10-04 号・v2・5項目の1通りのみ。`renderRecheckItemLines` への共通化後も一致）。`finalize.mjs` の警告は、スタブの `build.mjs` を持つ一時リポでの実行（`release-dates` は実ネットワーク）で確認。
- **未検証**: 実リポに `recheck/codex/` が存在する状態での `node build.mjs` / `emit-recheck.mjs` の通し実行（実リポへの作成は禁止のため。一時ディレクトリの `emit-recheck.mjs` のみ）。`finalize.mjs` を実リポで `--regenerate` まで通した実行。`latest-recheck-codex.md` の文面が Codex に読まれて意図どおり働くか（注入していない）。status.json の書き手が出した実ファイルでの検証（実在しない）。Claude 直下の `agent` 制限が、過去の週次スキルの出力に与える影響（既存7件は適合を確認。将来の出力は未検証）。

## 10. Codex 用スキルの新設と手動1回試行（2026-10-06 親セッションの判断。ユーザー未承認の部分あり）

背景: 書き手が未決だった Codex の提案書き手（§9(i)-1）について、ユーザーが「Codex の設定は変えるべきだと思う」と明言した。Codex 自身の助言（`C:/Users/Owner/.claude/tmp/advice-codex-r2.txt`）は「スキルで開始し、実績を見てから定期自動化へ」、上位レビューは「Codex 本人が書く」。よって今回は**スキルの新設と手動1回の試行まで**。定期自動化（`~/.codex/automations` の新設）はしていない（実績を見てから）。

### 実施内容
- **スキル**: `self-update-check-codex`。実体 `F:/Dev_hub/skills/codex/self-update-check-codex/SKILL.md`（日本語）。Claude 版 `self-update-check` の Codex 版で、Codex 本人が実行する手順。出力先は `C:/Users/Owner/.claude/tmp/codex-selfupdate-out/` の `<号>.json`（v2）と `<号>.status.json` のみ。`~/.codex` は読むだけ（編集禁止）、実リポ `recheck/codex/` へは配置しない、と明記。提案は候補、各提案に確認方法と未検証範囲を必須、該当ゼロは `[]`、取得失敗の出典は `ok:false`（「該当なし」にしない）、Codex CLI 個別リリースノートは `sources.mjs` に無いため「未登録・取得対象外」と明記し URL を捏造しない。
- **配置**: `~/.codex/skills` は**スキルごとの Junction**（ask-hermes のみ SymbolicLink）で、`F:/Dev_hub/skills/codex/` に置くだけでは見えない。`mklink /J`（`link-youtube-skills.ps1` と同じ方法。管理者権限は実際には不要で通常権限で成功）で `~/.codex/skills/self-update-check-codex` → 実体 を1本だけ作成。続けて `scripts/regenerate-junction-restore.ps1` で復旧 cmd を再生成（手書きしていない。git diff は日付行の更新と本件の新規1行のみ。再生成後の記録件数は 45）。既存 Junction の削除・移動・上書きは無し。
- **`~/.codex` 前後差分**（設定系を除く2階層の一覧を前後比較）: 意図した変更は `skills/self-update-check-codex`（新規 Junction）のみ。AGENTS.md・config.toml・rules・automations・hooks.json に差分なし。Codex 実行に伴うランタイム管理のファイルの更新（`cap_sid`・`models_cache.json` の mtime・ロック／tmp ディレクトリ）は出ているが、設定ではない（mtime は根拠にせず、サイズと内容系のファイルが不変であることで見た）。

### Codex 本人による外部添削（read-only・全文埋め込み。回答全文 `C:/Users/Owner/.claude/tmp/codex-skill-review.txt`）
結論: 「想定の workspace-write 環境なら条件付きで実行可能。SKILL.md だけでは承認待ちなしの完走は保証できない」。ただし Codex 側のシェルは添削時に `CreateProcessAsUserW failed: 5` で起動できず、バリデータ実装との照合・取得試験はしていない（自己申告）。

| 指摘 | 採否 | 理由 |
|---|---|---|
| 権限・ツールの事前確認が無い | 採用（Step 0 新設） | 承認で待たず、できない項目を報告して進める |
| 日付のタイムゾーン未指定／再実行時の上書き方針 | 採用 | Asia/Tokyo 固定・2ファイルを両方作り直す |
| `sources.mjs` が読めない場合の扱い | 採用 | 登録状況は未確認と報告し、出典なしと断定しない |
| 「sources に入れると確認したことになる」が Step 7 と不整合 | 採用 | 「取得対象外」「取得を試みた出典の記録」に言い換え |
| 日付不明を根拠にできる記述が期間限定と矛盾 | 採用 | 日付不明は根拠にしない |
| 期間全体を読めたことを ok:true の条件に／部分取得の reason | 採用 | 抜粋・要約だけなら ok:false |
| 重複の定義が無い | 採用 | 同一ファイルへの同一変更。既出の存在だけで採用済みとしない |
| Grep が機能名だけでは足りない／Junction 二重 | 採用 | 設定キー・回避策でも検索、実体パスで統一 |
| 理由不明の回避策の扱い | 採用 | 「理由不明」と書き撤去を断定しない |
| 環境が読めず `[]` を書くと「該当なし」に見える（status スキーマで表せない） | 採用（運用で補う） | `codex-environment` を `ok:false` で `sources` に加え、部分確認にする。スキーマは変えていない |
| Step 8 の検証が目視か実行か曖昧 | 採用 | Node で2関数を直接適用、不可なら目視だったと報告 |
| BOM・コードフェンス混入の落とし穴 | 採用 | UTF-8 BOM なし・配列のみと明記 |
| 目的文「学習カットオフ以降」と期間限定のずれ | 採用 | 「対象期間内の公式更新」へ |
| status スキーマに環境照合の成否を持たせる | **見送り** | 検証コード（recheck-lib）の変更になり今回の範囲外。上の運用で当面補う。未決（下記） |

### 手動1回試行（`codex exec -s workspace-write -C <出力先>`、タイムアウト 1200 秒）
- **完走した。** 所要 **136 秒**、rc=0。`approval: never` の非対話実行のため、承認要求で停止することは起きない構造（承認が要る操作は失敗として返る）。
- Codex 側のシェル（pwsh）は `CreateProcessAsUserW failed: 5`（アクセス拒否）で**起動できなかった**が、`node_repl` と Web 検索で代替し完走した（添削時と同じ事象。Codex の sandbox 下でシェルが使えない状態が続いている、と読める。原因は未調査）。
- 出力: `2026-10-04.json`（提案 **2件**、いずれも `agent:"codex"`・`改善提案`）と `2026-10-04.status.json`（`openai-chatgpt-codex-changelog` が `ok:true`）。BOM なし。
  1. 週次 TechNews の固定モデル（`automations/technews-weekly/automation.toml` の `gpt-5.6-terra`）を GPT-6.1 Sol と比較する。
  2. `instant_interrupt`（opt-in）を `config.toml` で試す。
- **人が書き換えずに**検証（`C:/Users/Owner/.claude/tmp/codex-trial-validate.mjs` で `recheck-lib.mjs` を直接 import。実リポは書き換えていない）:
  - `validateRecheck` OK（2件・agent=codex）
  - `validateRecheckStatus` OK（checkFailures=[]）
  - `deriveCheckState` = `{"state":"2件","detail":"予定の出典をすべて確認し、提案 2 件"}`、`checkAge` = 0日・stale=false
  - `renderAgentRecheckMd('codex', …)` で「提案は候補であり、採用済みのルールではない」の冒頭文つき Markdown が生成できた
- 実リポの `git status`（p-p-TechNews）は試行前後で同一、`recheck/codex/` は作っていない。

### 確認の範囲
- **通した条件**: Codex 本人が単独で（手順書の読み取りから）2ファイルを生成し、既存のバリデータ2つと状態導出を通った（2026-10-04 号・1回）。親側で `automation.toml` の `model`・`config.toml` の `[features]` が Codex の記述と一致することを確認。
- **未検証**: 提案内容の正しさ（changelog 原文との突合は未実施。2026-09-29 の記載・CLI 0.159.0 / 0.159.1 の内容は Codex の取得結果のまま）。提案2件を採用したときの効果。複数回の再現性（1回のみ。LLM の出力は回ごとに変わる）。取得失敗・`~/.codex` 読み取り不可の分岐（試行では起きていない。SKILL.md の記述どおり動くかは未確認）。定期実行（スケジューラ経由）での動作。実リポ配置後の `build.mjs` / `emit-recheck.mjs` / `latest-recheck-codex.md`。注入（`inject.mjs` / AGENTS.md）経路。Codex のシェル起動失敗の原因。
- **注意**: `~/.codex/skills` の Junction は `scripts/restore-skill-junctions.cmd`（Dev_hub 側・未コミット）に反映済みだが、Junction は git で復元されない。

### 未決事項
1. 試行出力を実リポ `recheck/codex/` へ配置してよいか（配置すると `latest-recheck-codex.md` が生成され、Codex の週次 build・公開範囲 §5 項1 に影響する）。
2. 定期自動化へ進む条件（実績の基準・頻度・承認）。
3. status スキーマに「環境照合の成否」を持たせるか（現状は `codex-environment` 疑似出典で補う運用）。
4. Codex の sandbox でシェルが起動できない件を直すか（`config.toml` の変更は Codex 設定変更で、ユーザー判断）。
5. 提案2件の扱い（採用・却下・保留を残す場所が無い。§9(g) と同じ）。

## 11. 提案2件の原文突合と実リポへの配置（2026-10-06 親セッションの委任作業。ユーザーは「残件を含めて進めてよい」と承認済み）

### 突合結果（Codex の出力は無修正）
取得は **WebFetch（小型モデルによる要約経由）**。原文そのものの逐語照合ではない。changelog は `developers.openai.com/codex/changelog` が `learn.chatgpt.com/docs/changelog` へ 308 転送されるため後者を取得（Codex が出典URLとして記録したのも後者）。GitHub は releases 一覧に 0.159.x が出ず（最新 0.160.1）、タグページ `rust-v0.159.0` / `rust-v0.159.1` を個別取得した。

| 提案 | 項目 | 結果 | 根拠（要旨） |
|---|---|---|---|
| 1 固定モデル | GPT-6.1 Sol が 2026-09-29 に changelog 掲載、識別子 `gpt-6.1-sol` | 確認できた | 「near-Astra の性能、Astra より低コスト」「繰り返し・長時間のコード/アプリ/文書作業」 |
| 1 | 利用可否はプラン・クライアント・ワークスペース依存 | 確認できた | changelog に同旨 |
| 1 | CLI 0.159.1 でカタログの既定モデルに追加 | 確認できた | changelog と GitHub タグ rust-v0.159.1（9/29）の双方 |
| 1 | 実環境: automation.toml が `gpt-5.6-terra`・`medium`・ACTIVE・日曜21時 | 確認できた | 該当行を直接確認（rrule は BYDAY=SU;BYHOUR=21） |
| 1 | config.toml の既定が gpt-6.1-sol | 確認できた | 1行目 `model = "gpt-6.1-sol"` |
| 1 | 提案の飛躍 | 無し | 「比較試行→合格なら判断」「固定理由の確認前に置換しない」「Terra に対する優位は未確認」と断定を避けている |
| 2 instant_interrupt | CLI 0.159.0（9/29）で opt-in の `instant_interrupt`、モデル応答中や長い code-mode 呼び出し中の新入力で方針変更 | 確認できた | changelog と GitHub タグ rust-v0.159.0 の双方 |
| 2 | 実環境: [features] は js_repl=false・memories=true、instant_interrupt 未記載 | 確認できた | config.toml 345-347行付近（キー名・値のみ確認） |
| 2 | 設定キーの配置・対応版 | 突合していない | 提案自体が「適用時に公式設定リファレンスで確認」としている。本作業でも config ドキュメントは未取得 |
| 2 | 提案の飛躍 | 無し | 「取消し・完了を保証しない」と限定。設定構文を未確認のまま書き換えないと明記 |

食い違いは検出されなかった。

### 配置
2件とも(a)(b)(c)が確認できたため、2ファイルを無修正で `recheck/codex/` へコピー（`cmp` で一致確認）。`.assetsignore` に `latest-recheck-codex.md` を追記（wrangler.toml・firebase-auth-poc は未変更、デプロイなし）。`build.mjs` exit 0（新規警告なし、既存の 2026-08-23 未確認のみ）、`emit-recheck.mjs` exit 0 で `latest-recheck-codex.md` を生成（状態「2件」・提案2件・「提案は候補であり、採用済みのルールではない」を確認）。`latest-recheck.md` と `work-reverse-index.md` は変更前とバイト一致。号HTML・knowledge に Codex の提案文言（instant_interrupt／固定モデルの題）は混入していない。

### テスト
`node --test tests/*.test.mjs`: 242件中 237 pass / 5 fail。既存失敗の test 5・7・9 に加え、**新規に test 85・126 が失敗**。いずれも「実リポの recheck/ に agent 別ディレクトリ・status.json が無い」ことを前提にした実データ依存のテストで、配置により前提が崩れたことが原因（コードの退行ではない）。テストは書き換えていない。

### 確認の範囲
- 通した条件: 上表の項目を、要約経由の取得と実ファイルの該当行で突合（2026-10-06 時点・1回）。
- 未検証: 原文との逐語照合、config 公式リファレンスでの instant_interrupt のキー配置、提案を採用した効果、`gpt-6.1-sol` が週次実行（スケジューラ・本アカウント）で実際に使えるか、Codex 出力の再現性。

### 見送り・残件
- test 85・126 を実リポ配置後の状態に合わせて直す（実データ非依存にする）かは未決。
- Codex の週次 build への反映・公開範囲（§5 項1）は変えていない（HTML には載せない方針のまま）。

## 12. 提案の「確認方法」を副作用の無い範囲で実行し、台帳に事実を残した（2026-10-06 委任作業）

### 経緯
ユーザーの指摘（2026-10-06）: 「材料が少ないから判断基準が定まらない。現段階でも材料は増やせる」。成功基準が決まらない理由は材料の薄さで、各提案に書かれた確認方法を実際に実行すれば材料を増やせる。そこで採否の判断はせず、事実だけを `recheck-decisions.jsonl`（追記専用・1行1事実）へ記録した。**decision（採用・却下等）の欄は作っていない。** 他のコード（recheck-lib.mjs・build.mjs・emit-recheck.mjs・finalize.mjs）はこの台帳をまだ読まない。`.assetsignore` に追記（デプロイはしていない）。

### 範囲
- 対象: 現行の提案8件（Claude 10-04 の5件、09-27 の1件、Codex 10-04 の2件）の確認方法と前提の再確認、および過去の全提案17件（recheck 全7号＋codex 1号。09-13・09-20 は項目0件）のその後の痕跡。
- 実行した範囲: 本番設定の読み取り、`claude --safe-mode -p`、バージョン確認、scratch での一時設定・一時 mod（`--settings` / `--plugin-dir`、`--setting-sources local`）、`codex exec -s read-only --ephemeral` の1語応答、`codex features list`、list_task_runs（読み取り）。
- 実行しなかった範囲: 本番設定・rules・hooks・~/.codex への書き込み、Mods の本番導入、defaultMode 変更、デプロイ、git 書き込み。提案の採用そのものが要る確認は「未実行」と記録した。

### 結果の要旨（台帳 39行）
- trial: reproduced 6 / not-reproduced 3 / premise-differs 1 / undeterminable 1 / not-run 3。premise-check: premise-holds 7 / premise-differs 1。trace: trace-found 3 / trace-none 14。
- 再現した主なもの: `--safe-mode` は認証を保ったまま応答し hook を読まない／Bash(...) 形式の deny は PowerShell ツールに掛からず PowerShell(...) 形式は掛かる（2.1.281）／mod の throw は fail-open でツールは実行され、失敗行は debug ログに出る／Codex の2モデルとも `codex exec` で使え、CLI は今回起動した。
- 再現しなかった・食い違った主なもの: `-p` では `/doctor prompt-audit` が認識されない（バイナリには存在）／`-p` の permissionMode は 2.1.281・286・288 のすべてで default／mod の失敗行が transcript に出るのは -p では確認できず／instant_interrupt は features list 上「under development」。
- 過去提案17件のうち、ハーネスに痕跡があるのは3件。いずれも因果は未確認で、「痕跡なし」は却下を意味しない。

### 副作用の自己申告（記録として残す）
1. 作業中、`CLAUDE_CODE_GIT_BASH_PATH` を一時設定して通常の `claude -p`（本番設定込み）を1回実行したところ、本番の SessionEnd hook（`rm -rf C:/Users/Owner/.claude/tmp/*`）が実際に動き、`C:/Users/Owner/.claude/tmp/` の中身を消した。作業前にこのディレクトリの一覧を取っていないため、何が消えたかは不明。§9・§10 が参照する `advice-codex-r2.txt`・`codex-skill-review.txt`・`codex-trial-validate.mjs`・`codex-selfupdate-out/` が存在していたかも確認できない（現在は無い）。以後の実行は scratchpad 側へ移し、本番設定を読む通常実行はしていない。
2. 本番の settings.json・rules/recovery-harness.md・~/.codex/config.toml・AGENTS.md・F:/Dev_hub/.claude/settings.json の sha256 は作業前後で一致。`~/.claude` と Dev_hub の git HEAD も不変。

### 未検証
mod の注入内容が文脈に届くか（型定義の読み取りが auto mode の分類器に拒否された）／python hook と mod の検知速度の比較／対話セッションの起動時権限モード・定期タスクの承認モード／instant_interrupt の実際の中断動作／2モデルの週次品質比較／deny の実コマンド（git push --force 等）の実拒否／2.1.288 での deny 検証／対話での `/doctor prompt-audit`。

### 判断に残る点
基準づくりの材料は増えたが、trial の結果は「再現したか」であって「採用に値するか」ではない。基準を決める前に、(a) 提案の対象版（2.1.283〜288）と対話CLIの版(2.1.281)の差を揃えるか、(b) 副作用つきの確認（採用が要るもの）をどこまで許すか、(c) 痕跡の有無を何かの採否の代わりに使わない、をユーザーが決める必要がある。

## 13. 遡及追跡の取りこぼしを、持ち越し提案へ変換した（2026-10-06 委任作業）

### 経緯と成果物
遡及追跡（2026-06〜10-05・104件）で「今のハーネスに当てはまるが反映が見当たらない（applicable-not-reflected）」16件のうち、提案済みの3件（--safe-mode・権限モード auto 化・/doctor prompt-audit）を除く13件を、重複する話題をまとめて **12件**（Claude 10・Codex 2）にした。出力は `recheck-backfill/pending-proposals.json`（v2 書式。**次の週次（2026-10-11 号・10-12 実行）が取り込む持ち越し提案**。`recheck/` 配下には置いていない）。`validateRecheck` を `issue=2026-10-11` で直接通して例外なし（12件・agent は claude 10 / codex 2）。実行で得た事実は `recheck-decisions.jsonl` に19行＋検証1行を追記（issue は `pending-2026-10-11`、decision 欄は無し）。

**取り込み時の注意**: agent が codex の2件（Codex スキルカタログ・personality）は、`recheck/` 直下に置くと `loadRecheckByIssue` が拒否する（直下は claude のみ）。`recheck/codex/` へ分ける必要がある。

### まとめた話題
- fork スキル background 既定化（2.1.218）＋サブエージェント background 既定化（2.1.198）→ 1件
- CLAUDE_CODE_RETRY_WATCHDOG（2.1.186）と fallbackModel（2.1.166）は別件（目的が違う: 長期待機／別モデルへの退避）

### 提案ごとの実施した確認と通していない条件
| # | 提案 | 実施した確認（読み取り・scratch の --safe-mode のみ） | 結果 | 通していない条件 |
|---|---|---|---|---|
| 0 | fork/サブエージェント background 既定 | 5スキルの frontmatter grep、delegation.md grep、公式スキル文書、list_task_runs と run 末尾2件の transcript | 前提は成立。文書は「スキルそのものがプロンプトの定期タスク」で待機と書くが、週次は「スキルを呼ぶプロンプト」で同じ経路か決められない（undeterminable）。直近9回は全て succeeded | 週次経路で親が待つかの切り分け、各スキルが同期結果を必須とするか |
| 1 | cross-session | harness grep、公式設定リファレンス | **遡及追跡の前提「既定で自動配送」は現行文書と食い違う**（既定は notice）。緊急性は下がった | 実機での notice の確認、Windows 挙動 |
| 2 | RETRY_WATCHDOG | env キー名、公式 env-vars 文書、list_task_runs の所要時間 | 前提は成立。週次の所要が約11秒〜約8時間、2026-09-06 開始の run は約3.5日。**原因（承認待ち／再試行）は未特定** | 長時間 run の transcript の中身、WATCHDOG 設定時の実測 |
| 3 | fallbackModel | `claude --safe-mode -p --fallback-model haiku`、公式文書 | フラグは受理（存在のみ）。週次の失敗 run は0（他タスク未確認） | 過負荷時の実切替、切替が出力に残るか |
| 4 | blockReadsOutsideWorkingDirectories | settings 読み取り、公式文書 | 有効化すると通常作業（F: から ~/.claude を読む等）が拒否される見込みのため、**「有効にしない判断の記録」を提案**にした | --settings での実機拒否確認、auto 既定との相互作用 |
| 5 | syncClaudeAiSkills | settings キー、skills/synced の一覧 | 前提は成立（同期物が実在） | 使用実績、コンテキスト量、false 時の挙動 |
| 6 | /skill-doctor | `claude --safe-mode -p "/skill-doctor"` | **-p では認識されず**（not-reproduced）。skills 数は ~/.claude 30・Dev_hub/claude 23 | 対話セッションでの実行（-p の制約か safe-mode の影響かは未切り分け） |
| 7 | Fable 5 | `claude --safe-mode -p --model fable` | **利用クレジットが要り api_error**（premise-differs）。提案を「条件確認の後に決める」に変えた | クレジット有りの応答、サブエージェントでの受理、費用 |
| 8 | Notification hook | settings の hooks キー、公式 hooks 文書 | 前提は成立（Notification なし。イベントは文書に実在） | 実際の発火 |
| 9 | PRESENCE_FILE | 公式 env-vars 文書、settings | 前提は成立。agentPushNotifEnabled と同じ経路かは未確認 | 通知の実発生、外部ツールの実現手段 |
| 10 | Codex スキルカタログ警告 | スキル本数・frontmatter 文字数（約3,470）、config の skills.config 有無（本文は転記せず）、リリースノート要約 | 前提は成立。予算の上限値は取得できず | codex exec での警告の有無（not-run） |
| 11 | Codex personality 廃止 | config.toml の出現数、リリースノート要約 | 前提は成立 | 外した前後の挙動差、導入理由 |

### 優先度の考え方（親・ユーザー未承認の目安）
- **高**: 実害が出うるか、他の提案の前提になるもの。0（background 既定: 週次タスクの正しさ）、1（指示の出どころ。ただし既定が notice と分かり緊急ではない）、2（長時間停止の原因切り分け）
- **中**: 判断を記録に残す価値があるもの。3・4・5・6・7
- **低**: 効果が限定的、または外部ツールや条件確認が先に要るもの。8・9・10・11
- 優先度は「この環境で実害が出る見込み」で付けた。提案の数や発見の新しさでは付けていない。優先度の根拠は小さく、実運用の実績が出たら見直す。

### 副作用・安全確認
- 実行した `claude -p` は3回（Fable・fallback・skill-doctor）で、すべて `--safe-mode`（hooks を読まない）、作業ディレクトリは scratchpad。本番の SessionEnd hook は動かしていない（safe-mode のため）。**ただし tmp 全消去が起きなかったことの直接確認はしていない**（作業開始時の tmp 一覧を取っていない）。
- ~/.claude・F:/Dev_hub/.claude の settings、rules、hooks、~/.codex、~/.gemini、F:/Gemini_Env、Hermes config への書き込みは無し。Codex の config.toml は personality の行番号と出現数、`[[skills.config]]` の有無だけを見た（キー・秘密値は表示していない）。
- 他の run のセッション（list_events）を2件読んだ（読み取り）。

### 未検証（全体）
公式文書はすべて WebFetch の要約経由で原文の逐語照合ではない。提案の採用による効果、各提案を実機（対話セッション・定期タスク）で試した結果は全て未検証。2.1.281（対話CLI）と提案対象版（2.1.286〜）の版差は揃えていない。

### 人間が判断すべき残件
1. 12件を 2026-10-11 号へ載せるか、件数を絞るか（週次の想定は5件程度。12件は多い可能性）。
2. 取り込みの経路: 週次スキルに「pending-proposals.json を読んで該当号の recheck に移す」手順を足すか、親が手動で移すか。Codex 2件は `recheck/codex/` 行き。
3. #0 の切り分け実験（週次経路の同期）を行うか。#2 の長時間 run の transcript を読むか。
4. 優先度の分け方（上記）でよいか。

### §13 補記（2026-10-06 親セッション）: 持ち越し提案の振り分け

- **背景**: 持ち越し提案12件のうち #10・#11 は `agent: codex`。Claude の週次スキルが `recheck/<号>.json`（Claude 直下）へ取り込むと、段階2の制限（直下の agent は claude か省略のみ）で `loadRecheckByIssue` が throw し、`finalize` が error になる。優先順では後ろ（約3週目）で、顕在化の前に気づいた。
- **決定**: `recheck-backfill/pending-proposals.json`（Claude 10件）と `recheck-backfill/pending-proposals-codex.json`（Codex 2件）に分けた。両方 `validateRecheck` を通した（agent は claude / codex）。Codex 側は Codex 用スキル（`self-update-check-codex`）に「持ち越しの Codex 提案」の取り込み手順（最大2件、取り込み前に実物で再確認）を足した。
- **見送った案**: Claude 側スキルで agent 別に振り分ける案（スキルに分岐が増え、無人実行で壊れうる）。Claude の直下に codex 項目を許す案（段階2の「ディレクトリ名を正とする」方針と矛盾）。
- **確認範囲**: 分割後の2ファイルの検証はスキーマのみ。週次の実行（10-12）での取り込みは未検証。

### §14 ユーザー承認の記録（2026-10-06）

- **承認（ユーザー・チャットで明言）**: 持ち越し提案を優先度の順（高: #0・#1・#2 → 中: #3〜#7 → 低: #8〜#11）で流す方針（§13 の「優先度の考え方」の分け方）。承認は「1は承認する」。承認の対象は、持ち越し提案の流し方であり、各提案の採用（設定の実変更）は含まない。
- **決定（ユーザー・チャットで明言）**: 週次スキル `self-update-check` の `allowed-tools` は変更しない。このため Step 4b の事前実行は読み取り・Grep・WebFetch の範囲に限られ、`claude --safe-mode` や `codex` を使う確認は無人実行では「未実行」と記録される。見直しは、10-12 の週次の実行結果（未実行の割合）を見てから。見送った案: 事前実行まで無人でやらせるための `allowed-tools` 拡張（承認待ちで止まる危険と、本番 hook による tmp 消去事故との兼ね合い）。
- **有効化の実装（親セッション確認）**:
  - 持ち越しは `recheck-backfill/pending-proposals.json`（Claude 10件）が優先度順に並んでいる。週次スキルの Step 4c が「先頭から順に・最大5件」を読むため、初回（2026-10-12 実行・2026-10-11 号）は #0〜#4、次週は #5〜#9 が対象になる。Codex 分（2件）は `pending-proposals-codex.json` から Codex 用スキルが最大2件取り込む。
  - 順序・分割・書式は `validateRecheck` で検証済み（スキーマのみ。内容の正しさは未検証）。
- **未決のまま**: 平文 API キー3か所（`~/.codex/config.toml`、`~/.codex/rules/default.rules`、Hermes `config.yaml`）の扱い（ローテーションの要否）。各提案の採用・却下の判断（台帳の decision 欄は未作成。10-12 の実行結果を見て基準を決める）。
- **確認範囲**: 週次の実行（10-12）での取り込み・事前実行・取りこぼし点検は未検証。取り込みが1件も動かない場合の挙動（pending が空・形式不適合）はスキルの記述のみで、実行していない。

### §14 補記（2026-10-06）: 定期タスクの承認モードをユーザーが「自動認証」に変更

- **事実（ユーザーの申告）**: 2026-10-06（本日）、定期タスクの承認モードを自動認証に変更した。設定はアプリ側にあり、定期タスクの一覧 API（list_scheduled_tasks）には承認モードの項目が無いため、設定値そのものはエージェントから確認できない（記録なし＝確認手段なし）。
- **効果の確認手段**: list_task_runs の所要時間と、各 run の session_id からイベント記録（list_events）。次の定刻は 2026-10-12 21:13 JST。
- **変更前の実績（self-update-check-weekly の9回。承認モードは変更前のもの）**: 3日9時間停止したのは 2026-09-07 開始の1回のみ。その後の 9/14・9/22・9/28・10/6（01:30）の4回は成功している（9/28 は約9時間20分で、停止か正常な長時間かは未判別）。**つまり変更前の設定でも毎回止まっていたわけではなく、停止は間欠的**。「変更後に止まらなかった」ことで効果を言えるのは、変更後の複数回の実績が出てから。
- **訂正**: 同日の会話で、エージェントが「9/10 以降は止まっていない。変更が 9/10 以降なら整合する」と述べたが、変更は本日だった。この整合の解釈は成立しない（変更前の設定で5回成功していた）。
- **影響する持ち越し提案**: #2（RETRY_WATCHDOG。停止原因を容量エラーの再試行と仮定）は、原因が承認待ちとされているため前提が合わない。外す方針（ユーザー確認済み。反映は pending-proposals.json の編集で、取り込み前に行う）。
- **見直しの条件**: 10-12 の実行結果で、(a) 承認待ちなしに完走したか、(b) 事前実行（Step 4b）の「未実行」がどれだけ出たか。承認待ち停止の懸念が下がるため、`allowed-tools` 拡張の判断（ユーザー決定は「現状のまま」）を、実績を見て再検討できる。

## 16. AI間のやり取りの共有ログ（agent-exchanges）を新設した（2026-10-06 親セッションの判断による委任作業。ユーザーは「やってみて。残骸の掃除は整理の後」と指示）

### 背景（実測された阻害要因）
ユーザーの要望は「やり取りを、どのAIエージェントも後から振り返れる共有の仕組みにしたい。私がどこかで話したとき、その場のAIが過去を引けるように」。実測された阻害要因は3つ。(a) 相談の回答全文を `~/.claude/tmp` に置いていたら、本番 SessionEnd hook の全消去事故（§12）で消えた。(b) Claude が ask-* スキルを通さず `codex exec` を直接呼んだ例があり、スキル経由だけの記録では漏れる。(c) セッション記録・メモリは各CLIごとにローカルで、他エージェントから見えない。

### 作ったもの（最小の1片）
- `agent-exchanges/exchanges.jsonl`（追記専用の要旨）と `raw/`（原文。1件=1ファイル）。1件は id・ts・from・to・topic・question・premise・answer_summary・review・outcome・evidence・raw・tags・refs。要旨は各1200字以内、前提は各200字以内（セッション開始時の注入予算を圧迫しないため。全文は raw）。
- `log-exchange.mjs`（検証・id 自動採番・追記専用・秘密検査・`--raw-file`）、`recall.mjs`（キーワードAND検索・`--from/--to/--status/--limit`・`--show`・`--list`）、共通部品 `exchange-lib.mjs`（許可エージェントは `AGENTS` の1行）。依存なし。
- 共通スキル `F:/Dev_hub/skills/shared/agent-exchange-recall/SKILL.md`。ask-* を通さない直接呼び出しも残す手順を含む。
- `tests/agent-exchanges.test.mjs`（一時ディレクトリ。実リポのログは書き換えない）。`.assetsignore` に `agent-exchanges/` を追記（デプロイしていない）。

### 採った解釈
- **秘密検査**: 20字以上の英数字連続、`AIza` / `sk-` / `ctx7sk-`、`Bearer` トークンを拒否（値は表示しない）。実データで、エラー名 `NoConsoleScreenBufferError` や `CreateProcessAsUserW` が誤検出されたため、「大文字始まりの単語2つ以上＋末尾に大文字1字まで」の CamelCase 識別子だけを長い連続の検査から除外した。ランダムな鍵がこの形に合う確率は無視できるが、**検査を緩めた変更であり、ユーザー未承認**。commit の完全SHA（40桁）は拒否される（短縮形で書く）。
- **raw 欄**: `raw/<ファイル>` の形式なら実在を要求する（実装中に、存在しないファイルを指す行が通る穴を自分で作ったことに気づき塞いだ）。
- **初期データの ts**: 設計メモには日付しか無いため、全件 `2026-10-06T00:00:00+09:00`（時刻は記録なし）とし、`ts-date-only` タグを付けた。同日の件は id の順で並ぶが、**時系列の順序を保証しない**。

### 初期データ（14件）
Codex・Copilot・Agy・Hermes への最初の設計相談（§6）4件、Codex の段階2・段階3の外部添削（§7・§8）2件、Codex の残件助言（§9）、上位モデル(opus)の残件レビュー（§9）、Codex 用スキルの Codex 添削（§10）、Codex の提案2件の原文突合（§11。from=claude to=human・info）、週次スキルの Codex 添削（`recheck-backfill/skill-review-codex.txt`）、出所不明の相談出力3件（ルート直下の残骸）。キーまわりの分類器拒否は相談ではないので取り込んでいない。**raw が実在するのは、週次スキルの添削（recheck-backfill から複写）と残骸3件のみ。** 他は `~/.claude/tmp` 配下にあり、現在は存在しない（消去事故で消えた可能性があるが、消失の確認はしていない）ため「記録なし」。週次スキルの添削は、項目別の採否が設計メモに見当たらず `open`（推測で埋めていない）。

### 残骸の整理
ルート直下の agy / copilot / hermes の各 `.err` `.rc` `.txt`（未追跡）は、いずれも失敗した起動の出力（空プロンプト、プロンプト無し、Hermes の TUI が Windows コンソールを得られず失敗）で、回答を含まない。秘密検査（上記の識別子除外を適用）を通し、3組を1組1ファイルに連結して `raw/` へ複写、元ファイルの内容が複写に含まれることを確認してから元を削除した。どの相談の呼び出しかは不明で、`出所不明の相談出力` の info として3件登録した。

### 見送った案
- **Linear を正本にして最初から書く**: 承認と、各エージェントが Linear を読めるかが未確認。2段階目。
- **全文をセッション開始時に注入する**: 予算を圧迫する。要旨を短くし、全文は検索で引く形にした。
- **ask-* スキルの出力だけを自動記録する**: 直接呼び出し（実例あり）が漏れる。
- **メモリ機能に頼る**: エージェントごとに別で、他から見えない。

### 確認の範囲
- **通した条件**: `tests/agent-exchanges.test.mjs`（一時ディレクトリでの正常・必須・許可値・文字数・秘密拒否と非表示・追記専用・採番・recall の日本語検索と絞り込み）。実ログへの `recall.mjs` の実行（キーワード・`--show`）。
- **未検証**: 各CLIのエージェントがこのスキルを実際に見つけて使うか（Codex・Claude の一覧に Junction が出ることまでは確認、新規セッションでの発動は未確認）。同時書き込み（複数エージェントが同時に追記した場合の競合）。実際の長期運用でログが肥大したときの検索の応答。秘密検査の網羅性（上記のパターン以外の鍵は検出しない）。

### 段階2の提案（未承認）
1. Linear への書き込み（正本化。または複写）: ユーザー承認と、各エージェントの Linear 参照可否の確認が先。
2. ask-* スキルや hook からの自動追記: 直接呼び出し側の漏れは、hook（`codex exec` 等の Bash 呼び出し検知）で補う案がある。`~/.claude` の hooks の変更になるため承認が要る。
3. Copilot・Agy・Hermes への共通スキルの配布。Junction の既存方法の確認が先（今回は Claude・Codex のみ）。
4. 作成時の追記忘れを減らす手段（質問者側が相談の直後に必ず記録する運用の定着）。

## 17. やり取りを既存の Linear issue に結び付けた（2026-10-06 委任作業。ユーザーは「既存の適した番号に寄せる」ことを承認済み）

### 目的と背景
ユーザー指摘:「他のエージェントが過去のやり取りに気付けるかは、Linear への起票に掛かっている。やり取りの内容を、既存の適した Linear 番号に寄せていれば、気付く機会は増える」。§16 の共有ログは、ログを知っているエージェントしか引けない。そこで、関連する既存 issue に1コメントし、その issue を見た人が `recall.mjs --linear <番号>` で共有ログへ辿れるようにした。

### 使った Linear と確認
`mcp__linear__` を使用。`mcp__linear-work__` も同じ team（5-10、id 同一）を返し、同一ワークスペースと見られる（書き込みは `linear` のみで実施）。team 5-10 の実在を list_teams で確認。

### 対応表（根拠は各 issue の本文・コメントを読んで確認）
| ex-id（20261006-） | Linear | 根拠 |
|---|---|---|
| 001〜011 | **5-120**（In Progress） | 週次 self-update の出力を `recheck/<号>.json` に置く運用（5-120 のコメントで確立）を、agent 別に広げる設計・実装・添削の経緯。011 の添削対象（週次スキル）も 5-120 のコメントで書き換えた出力先の契約を含む |
| 001〜004 | **5-121**（Backlog） | どの CLI を実質の対象とみなすか（Codex のみ確定、Hermes・Copilot・Agy は対象外）の判断。self-update の最初の設計相談が同じ4者に投げられた。対象外とした面にも相談した点は扱い未整理で、コメントに事実のみ記載 |
| 012〜014 | **該当なし** | 出所不明の失敗した起動の残骸で、相談内容・目的が復元できない |

検討して見送った既存 issue: 5-134（定期タスクの無音死。Done のためコメントせず）、5-95（TechNews 自己更新導線。Done）、5-116（再判定の系譜。Low で着手せず・前提が別）、5-123（昇華の仕組み。目的が別）、5-38（Linear 編集ログ標準。AI が Linear を編集したログで、AI 間の相談の採否の記録とは別物）、5-15（Linear と実装履歴の結び付け。GitHub/CLI 連携で別）。

### 書き込んだもの
- **新規 issue 5-146**「エージェント間のやり取りの共有ログ（agent-exchanges）」（Backlog、プロジェクト「スキル基盤（AI開発支援）」）。共有ログの仕組みを記録する適した既存 issue が無かったため1件作成（5-146 から 5-120・5-121 へ related 関係を付けた）。
- **5-120 へ1コメント**（001〜011の表）、**5-121 へ1コメント**（001〜004の表）。いずれも要旨・採否・コマンド・前提・未検証を記載し、秘密・キーの所在は書いていない。コメント投稿直後に、自分が書いた2件を1回ずつ編集した（001 の「JSON 正本の一致」の主体を原記録に合わせて訂正した。他者のコメントは編集していない）。
- 既存 issue のステータス・担当・ラベルは変更していない。ただし新規 issue 作成時の related 関係の追加で、5-120・5-121 に関係リンクが付く（追記のみ）。

### リポ内の変更
- `agent-exchanges/exchange-links.jsonl`（追記専用・新設、15行）。`exchanges.jsonl` の14件の行は書き換えていない。
- `recall.mjs`: 結び付いた件の見出しに `(Linear 番号)`、`--show` に `[linear]` 行、`--linear <番号|URL>`、キーワード検索で番号も一致、`--links <file>`（テスト用）。`exchange-lib.mjs` に `readLinks` を追加。
- `tests/agent-exchanges.test.mjs` に3件追加（番号・URL・キーワード・--show・リンク無し・リンクファイル無し・壊れた行・実リポのリンクの整合）。
- 共通スキル `agent-exchange-recall/SKILL.md` に「Linear 番号からも引ける」と「新しいやり取りを残すときの結び付け手順」を追記（内容編集のみ）。

### 見送った案
- 全14件を1つの issue にまとめる: 内容が違う issue（運用と対象 CLI）に気付きの導線を張れない。
- 011 の採否を推測で埋めてコメントする: 記録なし（§13・§14 に項目別の採否が無い）。open のまま記載した。
- 完了済みの 5-134・5-95 へコメントする: クローズ済みのため見送り。

### 確認の範囲
- 通した条件: `tests/agent-exchanges.test.mjs` 16件全通過（一時ディレクトリ。実ログは書き換えない）。実ログへの `--linear 5-121`、URL 指定、`--show` の実行。Linear 側は書き込み結果の応答（コメントID・issue 番号）で確認した。
- 未検証: 各 CLI のエージェントが Linear を読めるか／5-120・5-121 を開いたエージェントがコメントの `recall.mjs` コマンドを実行できるか（リポは作成者のローカル環境のみで、リモートは無い）／コメント内の対応の妥当性をユーザーが確認したか。
- リポ全体のテストは 258件中3件失敗（knowledge の記事網羅・48記事のインデックス・asset-cleanup）。本作業のファイルとは別で、作業前から未コミット変更のある領域。原因は未調査。

## 19. Copilot・Agy・Hermes への共通スキル配布の調査と、Linear 参照可否の確認（2026-10-06 委任作業。ユーザーは「承認するから進めて」と明言。読み取り中心で、**Junction は追加していない**）

### 背景
§16 の段階2提案3（Copilot・Agy・Hermes への配布）と提案1の前提（各エージェントが Linear を読めるか）の確認。条件は「既存と同じ方法でそのまま追加できる場合のみ追加」「Gemini_Env・Copilot・Hermes・Codex には書かない」。

### 実測した事実
- **Agy**: `~/.gemini/skills` には Junction が6本（context7-mcp, continues, diagramize, gitmcp, gitmcp-copilot, youtube-upload）。**しかし Agy は `~/.gemini/skills` を読んでいない。** `agy -p` で質問し、Agy の自己申告（回答文から。こちらで一覧を直接見てはいない）は「読むのは `~/.agents/skills`、`~/.gemini/config/skills`、`config/plugins/*/skills`、内蔵 builtin。`~/.gemini/skills` は実在するがロードされていない。agent-exchange-recall・diagramize・continues は見えない」。`~/.gemini/skills` は旧 Gemini CLI の置き場で、後継 Agy に引き継がれていない可能性が高い（**推測**。diagramize が Agy から見えない自己申告とは整合）。実際に Agy が読む `~/.agents/skills` の7本は **Junction ではなく実体ディレクトリ**で、Dev_hub の同名スキルと内容が異なる（context-fork は SKILL.md・run.ps1 とも差分あり。別物の複製）。`~/.gemini/config/skills` も実体（antigravity-ja のみ）。`agy mcp list` は「No MCP servers configured」。
- **Copilot**: `~/.copilot/skills` は無い。`copilot skill --help` によると個人スキルは `~/.copilot/skills/` **または `~/.agents/skills/`**。`copilot skill list` に `~/.agents/skills` の7本が出た（cwd がホームだったため「Project」表示。個人としても読まれる、というヘルプの記述と整合するが、両者の区別までは未確認）。**つまり `~/.agents/skills` は Agy と Copilot の共通の置き場の見込み。** `~/.copilot/copilot-instructions.md` と `~/.copilot/instructions/` は存在しない。`copilot instruction list` は cwd の `.claude\rules` 等を拾った。
- **Hermes**: スキル置き場は `AppData/Local/hermes/skills`（カテゴリ別、`hermes skills list` で local/enabled を確認）。`.skills_prompt_snapshot.json` は生成物で手編集しない。正規の追加手段は `hermes skills install <identifier|SKILL.md の URL>`（レジストリ/GitHub/URL 向け。ローカルのディレクトリ指定は help に無い）。config の `skills.external_dirs` が空リストで存在する（外部ディレクトリを足す設定の見込みだが、**用途は未確認、config は編集していない**）。`hermes skills trust` は「プロジェクトの `./.hermes/skills`・`./.agents/skills` を読ませる」ためのもの。

### 実施したこと
- Junction・ファイルの追加は**していない**。理由: (1) Agy が実際に読む場所（`~/.agents/skills`）の既存の方法は実体コピーで、Junction ではない。条件の「既存と同じ方法」を満たさない。(2) 既存 Junction の置き場 `~/.gemini/skills` に足しても Agy に見えない。(3) `~/.agents/skills` への Junction は Agy・Copilot 両方に影響し、Dev_hub の複製との乖離（上記）という既存の問題と絡むため、ユーザー判断が先。
- 復旧スクリプトの再生成はしていない（Junction を増やしていないため）。
- 共有ログに `ex-20261006-015` を1件追記（Agy への確認）。

### Linear の参照可否
| エージェント | 判定 | 根拠 |
|---|---|---|
| Claude | 読める（確認済み） | `mcp__linear__` が使える |
| Codex | 登録なし（読めない見込み） | `~/.codex/config.toml` の `[mcp_servers.*]` は cli, cli-continues, context7, ralph, node_repl のみ（名前だけ抽出。linear 無し） |
| Copilot | 登録なし（読めない見込み） | `copilot mcp list` は User: context7 / Builtin: github-mcp-server のみ。`mcp-config.json` のサーバー名も context7 のみ |
| Agy | 読めない | `agy mcp list` が「No MCP servers configured」。`config/mcp_config.json` は 0 バイト |
| Hermes | 読める見込み | `hermes mcp list` に linear（https://mcp.linear.app/mcp）が enabled。実際に読めるか（OAuth 済みか）は未確認 |

**注記（手順の逸脱）**: Hermes の linear 登録を確認する際、`config.yaml` を開かない指示だったが、`grep` で `mcp_servers` 付近と `linear` を含む行・`skills` を含む行を抽出した（出力は先頭70字に切って確認。キーらしき値は出していない）。

### 見送った案
- `~/.gemini/skills` に Junction を足す: Agy に効かない（上記）。
- `~/.agents/skills` に Junction を足す: 上記(3)。承認待ち。
- Copilot に `copilot-instructions.md` を新規作成して入口1行を載せる: 書き込み禁止の範囲。`~/.agents/skills` が使えるならスキル配布のほうが筋が良い。
- Hermes の config.yaml を編集して `external_dirs` に Dev_hub を足す: 書き込み禁止。用途も未確認。

### 未検証
- `~/.agents/skills` に置いたスキルが Agy・Copilot の新規セッションで実際に発動するか（Agy は自己申告のみ。Copilot は list 表示のみ）。
- Copilot の `~/.agents/skills` が「個人」として読まれているか。
- `hermes skills install` が `file://` やローカルパスを受けるか。`skills.external_dirs` の意味。
- Hermes の Linear MCP が認証済みで実際に読めるか。Codex の Linear（OAuth 等、config.toml 以外の経路）は無いと断定できない。
- 複数エージェントからの Linear 参照が無い間は、§17 の「Linear 経由で気付く」経路は Claude と（未確認の）Hermes にしか効かない。

### 人間が判断すべき残件
1. `~/.agents/skills` に agent-exchange-recall を足すか。足すなら Junction（Dev_hub 正本を参照。既存7本は実体コピーで方式が異なる）か実体コピーか。Agy・Copilot 同時に効く。
2. `~/.gemini/skills` の6本（Agy に効いていない）をどうするか。復旧スクリプトの対象にもなっている。放置か整理かの判断。
3. Hermes に追加するなら、config 編集（`external_dirs`）か `hermes skills install` か。
4. Codex・Copilot・Agy に Linear MCP を登録するか（設定ファイル変更を伴う。承認が要る）。

### §19 補記（2026-10-06）: ~/.agents/skills への配布（ユーザー承認: 「推奨どおりで」）

- **実施**: `agent-exchange-recall` の SKILL.md を `~/.agents/skills/agent-exchange-recall/` へ**実体コピー**（既存7本の運用に合わせた。Junction は不採用）。ハッシュ一致を確認。`copilot skill list` に `agent-exchange-recall` が出た（Copilot が読む場所であることの実測。新規セッションでの発動は未検証）。Agy が `~/.agents/skills` を読む点は Agy の自己申告（未検証）。
- **見送った案**: Junction（既存の運用と違う）、`~/.gemini/skills`（Agy が読まないと自己申告）、Codex・Copilot・Agy への Linear MCP の登録（設定変更を伴う。Linear を読めるのは Claude と、見込みで Hermes のみ。手元の共有ログ `recall.mjs` が全員に届く経路）、Hermes への配布（`hermes skills install` がローカルパスを受けるか未確認）。
- **注意（前提が崩れる線）**: 実体コピーなので、Dev_hub 側の SKILL.md を更新しても自動では反映されない。更新したら再コピーが要る（`~/.agents/skills/context-fork` が Dev_hub 版と内容が食い違っていた前例がある）。
- **自動スタブ記録（段階3）**: 自己改変を伴うため分類器に2回拒否された。ユーザー判断は「推奨どおり」＝見送り。リマインダの実績を見てから再検討。

## 20. 円卓: 見送った項目を、各エージェントの環境に合わせて実現する案を各者に相談した（2026-10-06 委任作業。ユーザー提案:「見送った先は、その先々に合った実現化を、一緒に話し合って対策すれば？」。各者の設定・スキル置き場には書いていない。提案のみ）

### 背景
§16〜§19 で見送った4項目: (a) hook による自動スタブ記録（Claude の hook 追加は自己改変として分類器に2回拒否）、(b) Codex・Copilot・Agy への Linear MCP 登録、(c) Hermes へのスキル配布、(d) 各エージェントが自分のやり取りを自分で記録する仕組み。方針は「各者が自分の環境の仕組みで自分の分を記録する（他者の設定を Claude が書き換えない）」。Codex・Copilot・Agy・Hermes に同一の質問 Q1〜Q5（自己記録の仕組み／読む側の入口／Linear／触ってはいけない領域／相談時の注意）を、前提事実付きで非対話呼び出しした。全員の回答を取得（共有ログ ex-20261006-016〜019、原文は raw/、プロフィール 020〜023）。

### 各者の回答の要旨と根拠の種別
- **Codex**: 自分のローカル環境（設定・スキル・共有ログ）は読み取り拒否で**読めなかった**。Q1・Q2 の大半は公式仕様の引用と推測（PreToolUse/PostToolUse hook・AGENTS.md・SessionStart hook）。**新情報: 今回のセッションに Linear コネクタのツールがあり、5-117 を取得して Done を確認したと申告（実測の自己申告。こちらで未再現）。** §19 は config.toml から「Codex は Linear 未登録」としていたので、経路が別と見られる。
- **Copilot**: スキル本文と共有ログは読めたが、非対話モードでシェル実行・~/.copilot の読み取りが拒否され、多くが推測。hook 自動記録はヘルプに記載が見えないが非対応とは断定できない。推奨は指示ファイル＋明示コマンド。
- **Agy**: hooks.json（PreToolUse/PostToolUse）の存在を述べつつ、AGENTS.md の行動指示＋完了時の log-exchange 実行を推奨。**重要な食い違い: 今回「~/.agents/skills の agent-exchange-recall は一覧にロードされていない。プロジェクト直下 .agents/skills/ は認識される」と申告。§19 では ~/.agents/skills を読むと申告しており矛盾。どちらも自己申告で未検証。**
- **Hermes**: 最も実測寄り。ファイルIPC（F:/Dev_hub の inbox/outbox 監視）スキルを持つ。自動記録は IPC watcher／呼び出しラッパーへの組み込みが合うと推測。Linear MCP（OAuth）登録済み、認証済みかは未確認。hook 自動承認は無効・cron は deny。

### 実現化計画表（案。いずれも未導入）
| 項目 | Claude | Codex | Copilot | Agy | Hermes |
|---|---|---|---|---|---|
| (a) 自動スタブ記録 | 下の選択肢参照（導入しない） | PostToolUse hook で相談の呼び出しを観測（公式仕様。推測の域）。信頼操作はユーザー | 確認できた限り hook 記載なし。見送り | hooks.json はあるが「他AIとの対話か」を判定できず誤記録の懸念。見送り | IPC watcher／ラッパーに log-exchange 呼び出しを組む（推測）。Hermes 側の変更でユーザー承認要 |
| (b) Linear MCP 登録 | 済 | **既にコネクタ経由で読めるとの申告。まず再現確認**（登録は不要かも） | 登録は /mcp＋ユーザー承認。**不要案**: 共有ログ正本で Claude/Hermes に関連付けを依頼 | mcp_config.json に登録（現状0バイト）。**不要案**: recall.mjs --linear で足りる | 登録済み。認証済みか未確認→ユーザーが読み取り1件で確認 |
| (c) スキル配布 | Junction 済 | 一覧に表示と申告（実体未確認） | ~/.agents/skills に配置済み、list 表示を確認済み | **配置先の再確認が先**（上の食い違い）。プロジェクト直下 .agents/skills も候補 | 未配置。`hermes skills install` のローカルパス可否が未確認。指示ファイル1行が代替 |
| (d) 自己記録 | 相談の直後に Claude が記録（スキル手順どおり） | AGENTS.md 1行＋明示コマンド。受けた相談は相手AI名・相談IDを必須に | 指示ファイル1行＋スキル。完全自動は第一候補にしない | AGENTS.md の行動指示（推奨）。導入はユーザー | IPC 経路に記録を組み込む案。送受信点を確実に通る |
| 優先度（案） | 中 | 高（Linear 再現確認は低コスト） | 低〜中 | 高（配置先が不確実なまま「配布済み」と言えない） | 中（実測が最も厚く、有望） |
| 実績の測り方 | リマインダ後の記録率 | 同様に、相談件数と記録件数の差 | 同左 | 同左 | 同左 |

共通リスク: 自動記録は誤記録・秘密混入・要旨の質のばらつきを招く。記録は log-exchange.mjs（秘密検査あり）経由に限り、exchanges.jsonl への直接書き込みは禁止、が各者の一致した注意点。

### 一致した点と割れた点
- **一致**: (1) Linear は必須にせず、共有ログ＋`recall.mjs --linear`を正本に（Copilot・Agy・Hermes・Codex の全員）。(2) 導入・設定変更・認証はユーザー承認（全員）。(3) 各者の設定・認証・スキル置き場を他者が無断変更しない（全員）。(4) 完全な自動捕捉より、指示ファイル／スキルでの明示的な記録を第一候補にする（Codex・Copilot・Agy）。
- **割れた点**: 自動捕捉の可否。Codex は hook／ラッパーを推測として挙げ、Agy・Copilot は誤判定を理由に推さない。Hermes は IPC 経路への組み込みを推す。Agy のスキル読み込み元は前回と今回で自己申告が矛盾。
- **実測で答えた点**: Hermes（IPC スキル・MCP 登録）、Copilot（スキル本文と共有ログの読み取り）、Agy の一部（スキル一覧の挙動。自己申告）、Codex（Linear 取得の申告のみ）。**推測が中心だった点**: Codex・Copilot の自己記録の仕組み全般。

### Claude 自身の分（選択肢。導入はしていない）
自己改変の拒否を踏まえ、次から**ユーザーが選ぶ**。
1. **ユーザーが自分で hook を導入する**（Claude は書かず、文面の提案までに留める）。リマインダの実績を見てからでよい。
2. **導入しない**: 現状の rules/external-info-review.md の共有ログ節とリマインダ、スキルの手順で運用し、記録漏れを定期的に件数で点検。
3. **別の方法**: Dev_hub 側の ask-* スキルのスクリプトが相談の直後に下書き記録を出す（~/.claude の設定を触らない）。ただしこれも分類器が自己改変と見るかは未検証。
採否は未決。

### 見送る案
- 各者の設定ファイルに Claude が直接書く案（禁止の範囲。方針にも反する）。
- Codex・Copilot・Agy への Linear MCP 一斉登録（Codex の申告が事実なら不要。残る2者も代替で足りる）。
- 全員一律の hook 自動記録（誤記録・秘密混入の懸念と、判定できないという Agy の指摘）。

### 未検証
Codex が実際に Linear を読めること（申告のみ）／Agy のスキル読み込み元（矛盾する自己申告）／Hermes の IPC に記録を組み込めること／Copilot・Hermes の指示ファイル入口が実際に読まれること／各者の公式 hook 仕様（Codex の引用 URL は原文未確認）／Hermes の Linear 認証状態。Codex・Copilot は自環境を読めず、回答の多くは推測。

### 人間が判断すべき残件
1. Codex に Linear を読めるか実際に1件取得してもらい確認するか（読み取りのみ）。
2. Agy の配置先（~/.agents/skills か、プロジェクト直下 .agents/skills か）の確認と、必要なら配置（ユーザー承認）。
3. 各者に自分の指示ファイル（AGENTS.md 等）へ入口1行を足してもらうか（導入は各者自身＋ユーザー承認）。
4. Hermes の IPC への記録組み込みを進めるか。
5. Claude 自身の分の選択肢 1〜3。

## 21. 円卓後の検証（Codex の Linear 読取・Agy/Copilot のスキル認識）

記録日: 2026-10-06。共有ログ: ex-20261006-024〜026（tags: roundtable, verification）。

### 目的
§20 の未検証2点を、読み取り・リポ内変更だけで確かめる。(1) Codex が Linear を本当に読めるか（申告のみだった）。(2) Agy・Copilot がスキルをどこから認識するか（Agy の自己申告が矛盾していた）。

### 方法と結果
1. **Codex の Linear 読取（実測）**: `codex exec -s read-only` に 5-146 の取得を依頼。先に Claude が Linear MCP で取得しておき、Codex には答えを渡さず照合した。

| 項目 | Claude（MCP） | Codex |
|---|---|---|
| タイトル | エージェント間のやり取りの共有ログ（agent-exchanges） | 一致 |
| 状態 / 優先度 | Backlog / Medium | 一致 |
| プロジェクト | スキル基盤（AI開発支援） | 一致 |
| 本文の見出し | 7つ（目的〜段階2の提案） | 並びも一致 |

   Codex の実行ログに `codex_apps/linear.get_issue (completed)` があった。判定は「**実際に読めた**」。Codex は ツール名を `mcp__codex_apps__linear_get_issue` と述べた。
2. **スキル認識**: `.agents/skills/agent-exchange-recall/SKILL.md` を skills/shared から実体コピー（SHA256 一致）。

| 対象 | cwd | 結果 | 実測か申告か |
|---|---|---|---|
| Copilot `skill list` | リポ | 「Project skills」に表示（Personal 側からは消える。重複排除かは推測） | 実測（CLI 出力） |
| Copilot `skill list` | F:/Dev_hub | 「Personal skills」に表示（~/.agents/skills に実在を ls で確認） | 実測 |
| Agy | リポ | 一覧にあり。読み込み元はプロジェクト直下 .agents/skills と回答 | 自己申告。パスが配置直後の場所と一致 |
| Agy | F:/Dev_hub（リポ外） | 一覧に無し。読込元は builtin・~/.gemini/config/skills・プラグインと回答 | 自己申告 |

   Agy は cwd=リポのときだけ認識したため、プロジェクト直下の配置は **cwd（ワークスペース）依存**と推定。Agy が ~/.agents/skills を読む様子は今回も観測されなかった（前回の矛盾する自己申告のうち、そちらは支持されない）。ただし Agy の一覧を第三者が直接観測したわけではない。

### 判定の根拠の範囲
Codex は実測（照合＋実行ログ）。Copilot は CLI 出力で実測。Agy は自己申告で、cwd 比較による間接的な裏付けのみ。

### 見送った案
- Codex への Linear MCP 登録: 既に読めたため不要。
- Agy のグローバル配置（~/.gemini 等）への書き込み: 禁止範囲のため行わない。
- Agy の設定ファイルを開いての確認: 同上。

### 未検証
Codex の別 issue・コメント・書き込み権限／Agy がリポ外セッションでスキルを読む手段（ユーザー承認後の配置が必要）／Agy の「71件」等の数値／Copilot の重複排除の挙動／新規セッションでエージェントが実際にスキルを使うか。

### 残件（人間の判断）
1. Agy のリポ外セッションにも届かせるか。届かせるなら配置先（~/.gemini/config/skills 等）をユーザー承認で決める。リポ内作業だけなら現状（プロジェクト直下）で足りる。
2. 各者の指示ファイルへの入口1行（§20 残件3）、Hermes 記録組み込み、Claude 自身の分の選択肢は引き続き未決。

## 22. Hermes・Agy の Linear 読取の実測確認（2026-10-06 委任作業）

記録日: 2026-10-06。共有ログ: ex-20261006-027〜029（tags: roundtable, verification, linear）。リンク: exchange-links.jsonl で 5-146 に結び付け済み。

### 背景
ユーザーが「Hermes も Agy も Linear に接続した」と報告（ユーザー自身の操作。各者の設定ファイルはこちらでは開いていない）。§21 の Codex と同じ方法で、実際に読めるかを実測した。

### 方法
Claude が Linear MCP で 5-146 を先に取得（Backlog / Medium / スキル基盤（AI開発支援） / 見出し7つ / コメント2件）。この値は各者に渡さず、同一プロンプトで取得を依頼して照合。Hermes は `hermes.exe -z`（-m 無し、cwd=リポ）、Agy は `agy -p` を cwd=リポ と cwd=F:/Dev_hub の2通り。

### 照合表
| 項目 | Claude | Hermes | Agy（cwd=リポ） | Agy（cwd=F:/Dev_hub） |
|---|---|---|---|---|
| タイトル | エージェント間のやり取りの共有ログ（agent-exchanges） | 一致 | 一致 | 一致 |
| 状態 / 優先度 | Backlog / Medium | 一致 | 一致 | 一致 |
| プロジェクト | スキル基盤（AI開発支援） | 一致 | 一致 | 一致 |
| 本文見出し | 7つ（目的〜段階2の提案） | 並びも一致 | 一致 | 一致 |
| コメント件数 | 2 | 2 | 2 | 2 |
| 使用ツール（自己申告） | - | mcp__linear__get_issue / list_comments | get_issue / list_comments | 同左 |

判定: **Hermes・Agy とも「実際に読めた（実測）」。** 渡していない事実（見出しの並び・コメント件数）が一致。実行ログの呼び出し痕跡は、Hermes・Agy とも出力に最終回答しか無く直接確認できていない（ツール名は自己申告）。Agy は cwd による差が無かった。

### §19 の表の訂正
- Agy: 「読めない（agy mcp list が No MCP servers）」→ **読める（実測）**。§19 時点の観測は接続操作前の状態で、今は覆った。
- Hermes: 「読める見込み（認証未確認）」→ **読める（実測。認証済み）**。
- Codex（§19「読めない見込み」）は §21 で既に実測で覆っている。Copilot は §19 のまま（今回未確認）。

### §20 の計画表の更新点
- (b) Linear MCP 登録: Hermes・Agy は不要（読める）。Agy 欄の「mcp_config.json に登録（現状0バイト）」は前提が変わった。Codex も不要（§21）。残るのは Copilot のみ。
- 割れていた「Linear は必須にせず」の方針は変えなくてよいが、「Claude/Hermes にしか効かない」という §19 の懸念は解消方向（Claude・Codex・Agy・Hermes が読める）。

### 未検証
Hermes・Agy の別 issue・書き込み・コメント投稿の権限／接続が OAuth の個人権限か共有か／ツール呼び出しの実行ログでの直接確認／Copilot の Linear 参照（今回対象外）／新規セッションでの継続性（トークン失効時の挙動）。コメント件数は取得時点の値（検証中にコメントが増えれば変わる）。

### 人間が判断すべき残件
1. Copilot に Linear を接続するか（読めるのは未確認。不要案: 共有ログ正本のまま）。
2. Linear を読める4者が揃ったので、§16 段階2「Linear を正本にする」設計へ進むか（承認が要る）。
3. 各者の接続が個人 OAuth なら、トークン失効時の運用（誰が再認証するか）。

## 23. 段階2: やり取りの要旨を Linear の issue へコメントとして残す（2026-10-06 委任作業。親セッションの判断。ユーザー承認は「段階2に進んで」）

### 目的と背景
ユーザーの元の要望は「どこで話しても、その場のAIエージェントが過去のやり取りを振り返れる」。共有ログ（`recall.mjs`）はリポのファイルを読める環境が前提で、リポを読めない場所のエージェントには届かない。Linear は Claude・Codex・Hermes・Agy が読めると実測済み（§21・§22。Copilot は未確認）。そこで、**場所を問わず読める要旨は Linear の issue のコメント、全文・手元の写しは共有ログ**、という分担にした。

### 方針
やり取りを残したら、関連する既存の Linear issue へ、**それ単体で読める**コメント（要旨・前提・評価・採否・根拠・次の一手）を残す。書き込みは書けると確認できた者（今は Claude）が行い、読むのは全員。書けない者は下書きをユーザーか Claude に渡す。

### 実装（内容編集のみ。~/.claude の rules・hooks・settings は未編集）
- `log-exchange.mjs --linear <番号>`（複数可・URL可）: `exchange-links.jsonl` に追記し、Linear 用コメントの下書きを標準出力へ出す。下書きは**何かを書く前に**作り、秘密検査に落ちたら何も書かず理由（値なし）だけ出す。
- `recall.mjs --linear-comment <ex-id>`: 既存の1件から同じ下書きを再生成する。
- 下書きの共通部品は `exchange-lib.mjs` の `renderLinearComment`。各欄は700字（前提・根拠は200字、理由は400字）で切り、回答・プロンプトの全文は入れない。「次の一手・未決」は専用欄が無いため、open/deferred は「未決・記録なし」、それ以外は「記録なし」と出す（推測で埋めない）。
- 共通スキル `agent-exchange-recall` に標準手順を追記（1.1.0）。実体コピー2箇所（リポ直下 `.agents/skills/`、`~/.agents/skills/`）を更新し、SHA256 が正本・`~/.claude`・`~/.codex`（Junction）と一致することを確認。
- テスト `tests/agent-exchanges.test.mjs` に6件追加（計22件）。

### 既存コメントの見直し（5-120・5-121・5-146）
読んだのは各 issue の全コメント。5-120・5-121 のコメントは、ex-id ごとの要旨・採否・根拠の所在・未検証をそれぞれ書いており、**リポが無くても要旨と結論は分かる**。足りないのは各件の質問・前提の細部だが、表の「要旨」列と設計メモ参照で足りると判断し、追記しなかった。ただし「各エージェントが Linear を読めるかは未確認」は §21・§22 で古くなった（5-146 のコメントに事実あり）。5-146 の3コメントは単体で読める。**既存コメントは編集していない。**

### 見送った案
- **Linear を全文の置き場にする**: 長大になり検索性が下がる。回答全文に秘密が混じる危険も大きい。要旨だけを置き、全文は raw に残す。
- **自動投稿**: Linear への書き込み権限（Claude 以外）が未検証で、誤った記録を自動で積む危険がある。下書きを出し、投稿は人か書ける者が確認してから行う。
- **全員が書く運用**: Codex・Hermes・Agy の書き込み権限が未検証。

### 確認の範囲
- 通した: `tests/agent-exchanges.test.mjs` 22件（一時ディレクトリ。実ログは書き換えない）。実在の1件（ex-20261006-027）での `--linear-comment` 出力。スキルのコピーの SHA256 一致。
- 未検証: Codex・Hermes・Agy の Linear への**書き込み**権限／個人 OAuth の失効時の再認証（誰がやるか）／コメントが増えたときの肥大／他のエージェントが新規セッションでこの手順を実際に踏むか／下書きの秘密検査は既存パターンのみで網羅的ではない／実運用での `--linear` 付き記録（テスト以外）はまだ行っていない。

### 残件
- 指示ファイル側の入口（`external-info-review.md` の文面更新、Codex・Copilot・Agy・Hermes への入口1行）は提案のみ（親に報告）。
- 5-120・5-121 の「Linear を読めるか未確認」の古い記述を訂正するか（編集禁止のため追記コメントが要る。ユーザー判断）。
