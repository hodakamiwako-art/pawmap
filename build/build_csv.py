# -*- coding: utf-8 -*-
"""Googleマイマップなどに読み込めるCSVを書き出す"""
import json, csv, os

PREC = {'shop': '店舗単位', 'building': '建物単位', 'street': '通り単位', 'area': '地区中心'}

places = json.load(open('../data/places.json', encoding='utf-8'))
with open('../downloads/korea-dog-friendly-places.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['No', '種別/Kind', '店名(日本語読み)', 'Name (English)', '店名(ハングル)',
                'ジャンル(日)', 'Cuisine (EN)', '料理(日)', 'Dishes (EN)',
                '犬の同伴', 'テラス席/Terrace',
                '最寄り駅(日)', 'Nearest station (EN)', '駅まで(m)',
                '広域自治体(日)', 'Region (EN)', '市郡区(日)', 'City/District (EN)',
                'エリア(日)', 'Area (EN)', '住所(ハングル)', '電話', 'Instagram', '公式サイト',
                '緯度', '経度', '位置精度', '評価', '口コミ数', '業態',
                'Googleマップ', 'NAVERマップ', 'DiningCode', 'カテゴリ原文(韓)'])
    for i, p in enumerate(places, 1):
        st = p['station'] or {}
        gmap = f"https://www.google.com/maps/search/?api=1&query={p['lat']},{p['lng']}"
        naver = "https://map.naver.com/p/search/" + (p['ko'] + ' ' + p['addr']).replace(' ', '%20')
        dc = f"https://www.diningcode.com/profile.php?rid={p['rid']}" if p['rid'] else ''
        w.writerow([i, 'カフェ/Cafe' if p['kind'] == 'cafe' else 'ごはん/Meal',
                    p['ja'], p['en'], p['ko'], p['genre']['ja'], p['genre']['en'],
                    p['detail']['ja'], p['detail']['en'],
                    '店内OK / Indoors OK', 'あり/Yes' if p['terrace'] else 'なし/No',
                    st.get('ja', ''), st.get('en', ''), st.get('m', ''),
                    p['sido']['ja'], p['sido']['en'], p['sigungu']['ja'], p['sigungu']['en'],
                    p['area']['ja'], p['area']['en'], p['addr'], p['tel'], p['insta'], p['web'],
                    p['lat'], p['lng'], PREC[p['prec']], p['rating'] or '', p['reviews'],
                    p['induty']['ja'], gmap, naver, dc, p['cat_ko']])

pets = json.load(open('../data/pets.json', encoding='utf-8'))
with open('../downloads/seoul-vets-and-pet-shops.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['No', '種別(日)', 'Type (EN)', '名称(日本語読み)', 'Name (English)', '名称(ハングル)',
                '24時間', '市郡区(日)', 'District (EN)', '住所(ハングル)', '電話', 'Instagram', '公式サイト',
                '緯度', '経度', '評価', '口コミ数', 'Googleマップ', 'カテゴリ原文(韓)'])
    for i, p in enumerate(pets, 1):
        gmap = f"https://www.google.com/maps/search/?api=1&query={p['lat']},{p['lng']}"
        w.writerow([i, p['kind']['ja'], p['kind']['en'], p['ja'], p['en'], p['ko'],
                    'はい/Yes' if p['h24'] else '', p['sigungu']['ja'], p['sigungu']['en'],
                    p['addr'], p['tel'], p['insta'], p['web'], p['lat'], p['lng'],
                    p['rating'] or '', p['reviews'], gmap, p['cate_ko']])

for n in ['korea-dog-friendly-places.csv', 'seoul-vets-and-pet-shops.csv']:
    print(n, round(os.path.getsize('../downloads/' + n) / 1024), 'KB')
print('places', len(places), 'pets', len(pets))


stays = json.load(open('../data/stays.json', encoding='utf-8'))
with open('../downloads/korea-dog-friendly-stays.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['No', '種別(日)', 'Type (EN)', '名称(日本語読み)', 'Name (English)', '名称(ハングル)',
                'ペット可の根拠', '広域自治体(日)', 'Region (EN)', '市郡区(日)', 'City/District (EN)',
                '住所(ハングル)', '電話', 'Instagram', '公式サイト', '緯度', '経度',
                '評価', '口コミ数', 'Googleマップ', 'カテゴリ原文(韓)'])
    for i, r in enumerate(stays, 1):
        gmap = f"https://www.google.com/maps/search/?api=1&query={r['lat']},{r['lng']}"
        w.writerow([i, r['kind']['ja'], r['kind']['en'], r['ja'], r['en'], r['ko'],
                    '地図データに明記' if r['pet'] == 'flag' else '店名から判断',
                    r['sido']['ja'], r['sido']['en'], r['sigungu']['ja'], r['sigungu']['en'],
                    r['addr'], r['tel'], r['insta'], r['web'], r['lat'], r['lng'],
                    r['rating'] or '', r['reviews'], gmap, r['cate_ko']])
print('korea-dog-friendly-stays.csv',
      round(os.path.getsize('../downloads/korea-dog-friendly-stays.csv') / 1024), 'KB  stays', len(stays))
