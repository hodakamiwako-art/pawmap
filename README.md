# ソウル犬同伴マップ / Seoul Dog-Friendly Map

ソウルで**犬と一緒に店内に入れる**カフェ・レストラン100軒を、日本語とハングルの両方で地図から探せるウェブアプリです。

👉 **https://hodakamiwako-art.github.io/pawmap/**

ハングルが読めなくても使えるように作っています。店名は日本語読みで表示し、店員に見せるためのハングル店名と住所は別に大きく出します。

## できること

- **地図と一覧**から100軒を探す（道路・建物が見えるレベルまでズーム可能）
- **現在地から近い順**に並べ替え
- 種別（カフェ／ごはん）、**料理ジャンル33種**、区、テラス席の有無で絞り込み
- 日本語・ハングルどちらでも検索
- お気に入り登録（端末内に保存）
- Googleマップ／NAVERマップ／DiningCode へのリンク
- ホーム画面に追加してアプリとして起動（PWA）。一度開いた範囲はオフラインでも表示

## 犬の同伴について

掲載している100軒は**すべて店内に犬と入れます**。韓国・食品医薬品安全処が公開している
[반려동물 동반 가능 업소（ペット同伴可能業所）登録リスト](https://www.foodsafetykorea.go.kr/portal/petKorea.do)
に載っている店だけを選んでいます。これは改正食品衛生法にもとづき、犬の店内同伴を正式に届け出た店舗の一覧です。

そのうち**35軒はテラス席もあります**（アプリ内で「テラス席あり」と表示）。

⚠️ 犬種・体重の制限（10kg以下など）やケージ／カート必須といった**店独自のルールは公開データに含まれていません**。訪問前に電話かSNSでご確認ください。

## 内訳

| 項目 | 数 |
|---|---|
| 掲載店舗 | 100軒 |
| レストラン・食事 | 50軒 |
| カフェ・ベーカリー | 50軒 |
| 料理ジャンル | 33種類 |
| テラス席あり | 35軒 |
| エリア | 12区・55エリア |

## 構成

```
index.html              画面
app.js                  アプリ本体（Leaflet）
styles.css              スタイル（ライト／ダーク対応）
sw.js                   Service Worker（オフライン対応）
manifest.webmanifest    PWA 設定
data/places.json        掲載100軒のデータ
data/seoul-official-486.json  公式登録リストのソウル分486軒（選定元）
downloads/              CSV・単体HTML版
vendor/                 Leaflet 1.9.4
```

ビルド不要の静的サイトです。ローカルで見るには:

```bash
python3 -m http.server 4173
```

## データの出どころ

- 同伴可否 — [식품의약품안전처 반려동물 동반 가능 업소 현황](https://www.foodsafetykorea.go.kr/portal/petKorea.do)（全国2,597軒／ソウル486軒）
- 座標・料理ジャンル・評価 — [DiningCode](https://www.diningcode.com/)
- 地図タイル — [CARTO](https://carto.com/attributions) / [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors

## ライセンス

コードは MIT。地図データは ODbL（OpenStreetMap）に従います。
