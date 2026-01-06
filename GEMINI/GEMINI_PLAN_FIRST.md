[ ] 01. プロジェクトの初期化を行う。
    - `npm init` 相当の `package.json` 作成
    - `tsconfig.json`, `esbuild.config.mjs` の作成
    - `manifest.json`, `versions.json` の作成
    - `.gitignore` の作成
    - 基本的な `main.ts` の作成（プラグインロード確認用）
[ ] 02. 設定画面 (Config) を実装する。
    - `SettingTab` クラスの実装
    - TCP Port (number)
    - System Prompt Note (file suggest/dropdown)
    - System Prompt Add (textarea)
    - Command Text (textarea, default value)
    - Resource ignore patterns (textarea, default value)
    - 設定の保存・ロード処理
[ ] 03. Workspace (View) の基盤を作成する。
    - `Ribbon Icon` の追加
    - `WorkspaceLeaf` の登録 (`ItemView` 継承)
    - View の基本的なレイアウト作成 (React等は使わずObsidian API標準のDOM操作で行うか、効率のためにヘルパーを作る)
[ ] 04. Workspace UI: Location & GEMINI files エリアを実装する。
    - Location特定ロジックの実装
    - GEMINI関連ファイル (`GEMINI.md` 等) の存在確認ロジック
    - ファイル作成 (`CREATE`)、エディタで開く機能
    - `Refresh` ボタンの動作実装
[ ] 05. Workspace UI: Resource files エリアを実装する。
    - フォルダ内ファイル一覧取得
    - `Resource ignore patterns` に基づくフィルタリング
    - ファイルリンク表示機能
[ ] 06. Workspace UI: MCP Server & Log & Client Config エリアを実装する。
    - Status 表示, Start/Stop ボタン (UIのみ、ロジックは後)
    - Log テキストエリア
    - MCP Client Command 表示
    - MCP Client Configuration タブ切り替えとコピー機能
[ ] 07. Worker (MCP Server) の基盤を実装する。
    - `@modelcontextprotocol/sdk` (または相当するロジック) の導入検討 (Node.js環境依存の確認)
    - `net` モジュールを用いた TCP サーバーの構築 (Obsidianデスクトップ版はNode.js環境にアクセス可能)
    - サーバーの Start/Stop ロジックの実装
[ ] 08. Worker: MCP Prompts 機能を実装する。
    - `GEMINI.md` 取得
    - `system_prompt` 取得 (Note内容 + Addテキスト)
[ ] 09. Worker: MCP Resources 機能を実装する。
    - WorkspaceのResourceロジックを流用・連携してResource Listを提供
    - `read_resource` 対応（コンテンツ取得）
[ ] 10. Worker: MCP Tools 機能を実装する。
    - `read_resource` (Tool版)
    - `write_resource`
    - `append_resource`
    - `get_location`
    - `get_datetime`
    - `report_directory`
[ ] 11. 総合テストと動作確認。
    - 全機能の連動確認
    - エラーハンドリングの確認
