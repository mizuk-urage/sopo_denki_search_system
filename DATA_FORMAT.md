# データ形式

データファイルはUTF-8のJSONです。企画番号・テント番号は数値ではなく文字列にしてください。先頭ゼロや英字を保持できます。

```json
{
  "schemaVersion": 1,
  "dataset": "2026 第一エリア",
  "records": [{
    "id": "indoor-0012",
    "projectNumber": "0012",
    "projectName": "企画名",
    "organization": "団体名",
    "area": "indoor",
    "location": "教室・場所",
    "tentNumber": "C4",
    "approvedPower": "449W",
    "keywords": ["検索語", "別表記"],
    "otherText": "検索対象にしたい補足",
    "references": [{"label":"屋内電力シート", "file":"pdfs/indoor-power-sheet.pdf", "page":1}]
  }]
}
```

`area` は `indoor` または `outdoor`。未確認項目は空文字列や空配列にし、推測値を入れません。`references` の `file` は `data/` からの相対パス（例：`pdfs/indoor-power-sheet.pdf`）、`page` は1始まりのPDFページ番号です。参照するPDFはそのパスに配置してください。ファイル名に決まった規則はありませんが、配布・更新時に混乱しないよう、年度・資料種別が分かる英数字とハイフンの名前をおすすめします（例：`2026-indoor-power-sheet.pdf`）。`approvedPower` は桁区切りや注記を含めて文字列で保存します。

Service Workerは `references` に登録されたPDFを自動でキャッシュするため、新しい資料ごとにJavaScriptのファイル一覧を編集する必要はありません。追加したPDFをオフラインでも最初から読めるようにするには、JSONとPDFを配置し、Service Workerの `CACHE` 名を更新して再配布します。

画面から登録した資料は企画JSONとは別にブラウザー内で管理し、配線図（屋内・屋外）と電力シート（屋内・屋外）の4枠それぞれに1件を保持します。各枠にファイル名を表示し、同じ枠への登録は差し替えとして扱います。登録できる形式はPDFです。文字情報のあるPDF本文を検索語へ取り込みます。電力シートPDFは同梱PDF.jsで企画情報ページを抽出します。スキャンPDFはOCRしません。追加ファイルは端末ごとの登録です。全員へ共有する資料は `data/` に置いて `references` を編集します。

電力シートPDFから作成した端末内レコードには `localReferences` と `searchText` が加わります。`localReferences` は元PDFのIndexedDB内IDと企画ごとの開始・終了ページ、`searchText` は同じページ範囲から抽出した検索用の文字列です。これらは配布用 `data/data.json` へ手動コピーしないでください。共有用データへ移す場合は、元PDFを `data/pdfs/` に配置し、通常の `references` 形式で登録します。
