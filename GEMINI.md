# 目的

- obsidian のプラグインを作成する。
- 技術的な内容は、https://docs.obsidian.md/Plugins/Getting+started の配下のページから取得する

# 機能 

## Config

- Worker の TCP設定として、ポートの入力ができるようにする。数値のみ
- 名称を「System Prompt Note」とし、ノートを選択する。
- テキストボックスを設置、名称を「System Prompt Add」とする。15行程度。横幅は最大とする
- テキストボックスを設置、名称を「Command Text」とする。15行程度。横幅は最大とする
  - 初期値、以下を英訳する
      ```
      ObsidianよりGEMINI.mdを取得（GEMINI.md）
      Obsidianよりプロンプトを取得（SystemPrompt）
      Obsidianへプランを出力（GEMINI_PLAN.md）
      Obsidianへセッションの応答を出力（GEMINI_RESP.md）
      Obsidianへセッションの要約を出力（GEMINI_SUMMARY.md）
      Obsidianへ生成ファイルのリストを出力（GEMINI_OUTPUT.md）
      Obsidianへ、これまでの対話内容を `/chat share` と同様の形式で出力（GEMINI_CHAT.md）
      Obsidianよりプランを取得（GEMINI_PLAN.md）
      Obsidianよりセッションの応答・要約を取得（GEMINI_RESP.md,GEMINI_SUMMARY.md）
      Obsidianより生成ファイルのリストを取得（GEMINI_OUTPUT.md）
      ObsidianよりGEMINIファイルを確認（GEMINI.md,GEMINI_PLAN.md,GEMINI_RESP.md,GEMINI_SUMMARY.md,GEMINI_OUTPUT.md）
      Obsidianよりロケーションを取得
      Obsidianより現在時刻を取得
      Obsidianへ作業ディレクトリを出力
      ```
- テキストボックスを設置、名称を「Resource ignore patterns」とする。5行程度。横幅は最大とする
  - 初期値
    ```
    ^[_.].+$
    ^.+(?<!(.md))$
    ```
- 設定値を保存する。

## Workspace

- Ribbon Icon	をクリックすると、Workspaceを開く
- Workspaceを開くと以下を表示する
  - タイトルを 「Gemini Workspace」 とする
 - 「Location」エリアを設け、以下を設置する 
  - 以下の順序で「選択されているフォルダ」を特定し、表示する。この表示は大きくする。
    1. アクティブなエディタがあれば、その親フォルダ。
    2. エディタが空の場合、ファイルエクスプローラー（ファイルツリー）で選択されているファイルまたはフォルダ。
    3. いずれも特定できない場合はルートフォルダ。
 - 「GEMINI files」エリアを設け、以下を設置する
  - 「選択されているフォルダ」に対して、GEMINI.md, GEMINI_PLAN.md, GEMINI_RESP.md, GEMINI_CMD.md, GEMINI_OUTPUT.md, GEMINI_SUMMARY.md の存在を確認する。
      - それぞれのファイルに対し、ファイルが存在する場合は、更新時刻を表示する。ファイルが存在しない場合は `CREAET` ボタンを有効とする。
      - ファイル名部分リンク状とし、クリックしたら、 Editor にそれを表示する。
      - `CREAET`ボタンをクリックしたら、 そのファイルを新規作成し、Editor にそれを表示する。
  - GEMINI.md, GEMINI_PLAN.md, GEMINI_RESP.md, GEMINI_SUMMARY.md, GEMINI_OUTPUT.md, GEMINI_SUMMARY.md の部分は表形式とする。
  - `Refresh`ボタンを設け、ボタンを押下で以下を実施する
    1. 選択フォルダの再特定:
      現在のアクティブなエディタやファイルエクスプローラーの選択状態から、対象とするフォルダを特定し直します。
    2. ファイルの存在確認とステータス更新:
      そのフォルダ内に GEMINI.md や GEMINI_PLAN.md などのファイルが実際に存在するかを再スキャンします。
    3. 更新時刻の再取得:
      存在するファイルの最新の更新時刻（Modified）を取得し、画面上の表を更新します。
    4. UIの再描画:
      上記の結果に基づき、ボタンが `CREATE` の表示／非表示 を正しく切り替えます。
 - 「Resource files」エリアを設け、以下を設置する
  - 「選択されているフォルダ」に対して以下の条件を満たすファイルを対象とする。
    - 条件
      - 「選択されているフォルダ」直下のファイル
      - GEMINI.md, GEMINI_PLAN.md, GEMINI_RESP.md, GEMINI_CMD.md, GEMINI_OUTPUT.md, GEMINI_SUMMARY.md 以外のファイル
      - 「Resource ignore patterns」の各行で定義されている正規表現パターンにマッチしないファイル
    - それぞれのファイルに対し、ファイルが存在する場合は、更新時刻を表示する。
    - ファイル名部分リンク状とし、クリックしたら、 Editor にそれを表示する。
  - 「GEMINI files」エリアの  `Refresh`ボタン押下で内容を最新に更新する
  
- 「MCP Server」エリアを設け、現在の Worker起動状態を表示する(`Status:RUNNING` または `Status:STOPPED`)。またその横にボタンを設置する。そのボタン `START`, `STOP` にて Workerの起動と停止を行う。`START`, `STOP`は排他表示とする。
  - ボタン押下時にトースト表示をする。

- 以下のエリアを設ける。タイトルを「MCP Client Command」とする。
  - Command Text の内容に対し、一行ごとに箇条書き式で テキストを表示する。
    - テキスト部分はリンク状とし、クリックされたらテキストをクリップボードにコピーする。コピーしたらトースト表示をする。
    
- 以下のタブエリアを設ける。タイトルを「MCP Client Configuration」とする。各タブにはテキストを設置する。TCPポート設定が変更されたら即座にテキストを更新する。
  - nc
    ```
    gemini mcp add obsidianMcpServer nc "127.0.0.1" "28088"
    ```  
  - wsl.exe
    ```
    gemini mcp add obsidianMcpServer "wsl.exe" "ncat.exe" "127.0.0.1" "28088"
    ```  
  - ncat.exe
    ```
    gemini mcp add obsidianMcpServer ncat.exe "127.0.0.1" "28088"
    ```  
 - タブ領域の下部に以下を設置する。
  - `CopyToClipboard`ボタンを設置し、ボタン押下でタブ部に表示されているテキストをクリップボードにコピーする。
  - ボタンの横に `See .gemini/settings.json` を記載する。

- 以下のエリアを設ける。タイトルを「MCP Log」とする。
  - テキストエリアを設け15行程度で横幅は最大とする

## Worker

- Worker は以下の機能を持つ
  - MCPサーバーとして、`@modelcontextprotocol` を使用する。
    - ドキュメント参照
      - https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
      - https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/server/src/simpleStreamableHttp.ts
      - https://modelcontextprotocol.io/docs/learn/server-concepts
  - 名称を `obsidianMcpServer` とする
  - 説明を 「GEMINI.md を提供する」 とする
  - MCPサーバーとして tcp接続と http/sse接続を実装する。
    - tcp モードはデフォルトで、PORT:28088 とする
    - http/sse モードはデフォルトで、PORT:28089 とする    
  - MCPサーバーとして以下の機能をMCPクライアントに提供する
    - カテゴリ:prompt
      - 名称:GEMINI.md
        - GEMINI.md ファイルの内容を返す
      - 名称:SystemPrompt
        - 「System Prompt Note」ファイルの内容と、「System Prompt Add」のテキスト内容を結合して返す
    - カテゴリ:resources
      - 以下を対象とする
        - 「選択されているフォルダ」直下のファイル（サブフォルダ配下のファイルは対象外とする）
        - GEMINI.md, GEMINI_PLAN.md, GEMINI_RESP.md, GEMINI_CMD.md, GEMINI_OUTPUT.md, GEMINI_SUMMARY.md ファイル
        - SystemPrompt 
        - 上記以外で「Resource ignore patterns」の各行で定義されている正規表現パターンにマッチしないファイル
    - カテゴリ:tools
      - 名称:`read_resource`
        - パラメーター:Resource名（必須）
        - 説明:リソースファイルの内容を返す。パラメーターにリソースファイル名を指定する。
        - 動作
          - 指定のファイルの内容を返す。
          - 対象ファイルは、Resourceの対象と同じとし、それ以外が指定された場合はエラーとする。
          - 対象ファイルが存在しない場合は空文字を返す
          - SystemPromptが指定された場合は、「System Prompt Note」ファイルの内容と、「System Prompt Add」のテキスト内容を結合して返す
      - 名称:`write_resource`
        - パラメーター:Resource名（必須）
        - パラメーター:content（必須）
        - 説明:リソースファイルの書き換えを行う。パラメーターにリソースファイル名を指定する。
        - 動作
          - 指定のファイルの内容を content 値で書き換える。
          - 対象ファイルは、Resourceの対象と同じとし、それ以外が指定された場合はエラーとする。
          - GEMINI.md, SystemPrompt が指定された場合はエラーとする。
          - 対象ファイルが存在しない場合は新規作成する。
      - 名称:`append_resource`
        - パラメーター:Resource名（必須）
        - パラメーター:content（必須）
        - 説明:リソースファイルの書き換えを行う。パラメーターにリソースファイル名を指定する。
        - 動作
          - 指定のファイルの内容の末尾に content 値を追加する
          - 対象ファイルは、Resourceの対象と同じとし、それ以外が指定された場合はエラーとする。
          - GEMINI.mdが指定された場合はエラーとする。
          - 対象ファイルが存在しない場合は新規作成する。
      - 名称:`get_location`
        - 説明:Obsidian の ロケーションを取得する。
        - 動作
          - 「Location」エリアの値を返す
      - 名称:`get_datetime`
        - 説明:現在時刻（ローカルタイム）を取得する。
        - 動作
          - 現在時刻（ローカルタイム）を返す。フォーマットは `yyyy-MM-dd hh:mm:ss`
      - 名称:`report_directory`
        - 説明:現在の作業ディレクトリを Obsidianに通知する。
        - パラメーター:dir（必須）
        - 動作
          - dirの値を「MCP Log」のテキストエリアに出す。

- MCPクライアントからのリクエストが来たら、「MCP Log」のテキストエリアにそれを追記する。その際テキストボックスを最下行にスクロールさせる。
  - 出力は、時刻：リクエスト とする。

- MCPクライアントが接続したとき、GEMINI.md と SystemPrompt を取得するように、MCPクライアントへ指示する。

- プラグイン起動時は、TCP機能を OFF とする。

- プラグインが無効となった場合、MCPサーバーの機能を停止する。

# その他

- 私が「MCPクライアントとのコマンドをまとめよ」といったら、MCPクライアントとのコマンドを報告する。
  - カテゴリ:prompt,resources,tools を一覧表示する
