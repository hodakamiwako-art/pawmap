# ソウル犬同伴マップ / Seoul Dog-Friendly Map

ソウルで**犬と一緒に店内に入れる**カフェ・レストラン486軒を、日本語・英語・ハングルで地図から探せるウェブアプリです。

👉 **https://hodakamiwako-art.github.io/pawmap/**

ハングルが読めなくても使えるように作っています。店名は日本語の読み仮名（または英語表記）で出し、店員に見せるためのハングル店名と住所は別に大きく表示します。

## できること

- **地図と一覧**から486軒を探す（道路・建物・店名が見えるレベルまでズーム可能）
- **日本語 ⇄ English の切り替え**。ハングルは常に併記
- **地下鉄・鉄道を重ねて表示**（11路線・448駅、駅名は日本語／英語）
- **自分のピンを追加**（散歩コース、ドッグラン、動物病院など。名前とメモ付き）
- **現在地から近い順**に並べ替え、距離を表示
- 種別（カフェ／ごはん）、料理ジャンル30種、区、テラス席の有無で絞り込み
- 日本語・英語・ハングルどれでも検索
- お気に入り登録
- **ログイン**すると、お気に入りと自分のピンが端末間で同期（Supabase）
- Googleマップ／NAVERマップ／DiningCode へのリンク
- ホーム画面に追加してアプリとして起動（PWA）。一度開いた範囲はオフラインでも表示

## 犬の同伴について

掲載している486軒は**すべて店内に犬と入れます**。韓国・食品医薬品安全処が公開している
[반려동물 동반 가능 업소（ペット同伴可能業所）登録リスト](https://www.foodsafetykorea.go.kr/portal/petKorea.do)
のソウル分**全件**です。これは改正食品衛生法にもとづき、犬の店内同伴を正式に届け出た店舗の一覧です。

そのうち**123軒はテラス席もあります**。

⚠️ 犬種・体重の制限（10kg以下など）やケージ／カート必須といった**店独自のルールは公開データに含まれていません**。訪問前に電話かSNSでご確認ください。

## 内訳

| 項目 | 数 |
|---|---|
| 掲載店舗 | 486軒（ソウルの登録店 全件） |
| カフェ・ベーカリー | 287軒 |
| レストラン・食事 | 199軒 |
| 料理ジャンル | 30種類 |
| テラス席あり | 123軒 |
| エリア | 25区 |
| 地下鉄 | 11路線・448駅 |

## データの精度について

- **位置** — 419軒は店舗単位で特定済み。残り67軒は住所からの変換で、うち37軒は通り単位のおおよその位置です（アプリ内でその旨を表示します）
- **読み仮名・英語表記** — 100軒は手作業で確認済み。残りはハングルからの機械変換（借用語辞書＋文化観光部2000年式ローマ字）です。ブランドの正式な綴りと異なる場合があります
- **料理ジャンル** — DiningCode のカテゴリから分類。カテゴリ情報がない67軒は業態（一般飲食店／軽飲食店／製菓店）から推定しています

## 構成

```
index.html              画面
app.js                  アプリ本体（Leaflet）
i18n.js                 日本語・英語の文言
store.js                お気に入り・自分のピンの保管と同期
config.js               Supabase の接続先（空でも動きます）
styles.css              スタイル（ライト／ダーク対応）
sw.js                   Service Worker（オフライン対応）
manifest.webmanifest    PWA 設定
data/places.json        掲載486軒
data/subway.json        地下鉄の路線と駅
data/seoul-official-486.json  公式登録リストの原本
downloads/              CSV（Googleマイマップに読み込めます）
vendor/                 Leaflet 1.9.4 / supabase-js 2
build/                  データを組み立てるスクリプト
```

ビルド不要の静的サイトです。ローカルで見るには:

```bash
python3 -m http.server 4173
```

## ログインを有効にする

1. [supabase.com](https://supabase.com) で無料プロジェクトを作る
2. SQL Editor で `build/schema.sql` を実行する
3. Settings → API の Project URL と anon public key を `config.js` に書く

`anon key` は公開前提の鍵です。行レベルセキュリティにより、各ユーザーは自分の行しか読み書きできません。
`config.js` が空のままでも地図は動き、お気に入りと自分のピンは端末内に保存されます。

## データの出どころ

- 同伴可否 — [식품의약품안전처 반려동물 동반 가능 업소 현황](https://www.foodsafetykorea.go.kr/portal/petKorea.do)
- 座標・料理ジャンル・評価 — [DiningCode](https://www.diningcode.com/)
- 住所からの座標変換 — [Nominatim](https://nominatim.openstreetmap.org/)（OpenStreetMap）
- 地下鉄の路線・駅 — [OpenStreetMap](https://www.openstreetmap.org/copyright)
- 地図タイル — [CARTO](https://carto.com/attributions) / OpenStreetMap contributors

## ライセンス

コードは MIT。地図データは ODbL（OpenStreetMap）に従います。
