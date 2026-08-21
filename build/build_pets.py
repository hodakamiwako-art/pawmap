# -*- coding: utf-8 -*-
"""カカオマップから集めたソウルの動物病院・ペットショップを pets.json に組み立てる"""
import json, re, os, sys
sys.path.insert(0, '.')
import translit as T
import lexicon as L

raw = json.load(open('pets_raw.json', encoding='utf-8'))

# 動物病院まわりの語彙。店名の音写に使う
EXTRA = {
 '동물병원': ('動物病院', 'Animal Hospital'), '동물의료센터': ('動物医療センター', 'Animal Medical Center'),
 '메디컬센터': ('メディカルセンター', 'Medical Center'), '동물메디컬': ('動物メディカル', 'Animal Medical'),
 '의료센터': ('医療センター', 'Medical Center'), '병원': ('病院', 'Clinic'),
 '펫샵': ('ペットショップ', 'Pet Shop'), '애견': ('愛犬', 'Dog'), '애완': ('愛玩', 'Pet'),
 '반려동물': ('伴侶動物', 'Pet'), '반려견': ('伴侶犬', 'Dog'), '용품': ('用品', 'Supplies'),
 '분양': ('分譲', 'Adoption'), '미용': ('トリミング', 'Grooming'),
 '놀이터': ('プレイグラウンド', 'Playground'), '훈련소': ('訓練所', 'Training'),
 '무인': ('無人', 'Unmanned'), '마트': ('マート', 'Mart'), '센터': ('センター', 'Center'),
 '동물': ('動物', 'Animal'),
}
for k, v in EXTRA.items():
    L.LOAN.setdefault(k, v)
LOAN_KEYS = sorted(L.LOAN, key=len, reverse=True)

LATIN = re.compile(r'^[A-Za-z0-9 .,&\'\-!?/()]+$')
HANGUL = re.compile(r'[가-힣]')


def usable_at(name, i):
    for k in LOAN_KEYS:
        if not name.startswith(k, i):
            continue
        if len(k) >= 2:
            return k
        before = i == 0 or not HANGUL.match(name[i - 1])
        after = i + 1 >= len(name) or not HANGUL.match(name[i + 1])
        if before and after:
            return k
    return None


def segment(name):
    ja, en, i = [], [], 0
    while i < len(name):
        if not HANGUL.match(name[i]):
            ja.append(name[i]); en.append(name[i]); i += 1; continue
        hit = usable_at(name, i)
        if hit:
            ja.append(L.LOAN[hit][0]); en.append(' ' + L.LOAN[hit][1] + ' '); i += len(hit)
        else:
            j = i + 1
            while j < len(name) and HANGUL.match(name[j]) and not usable_at(name, j):
                j += 1
            ch = name[i:j]
            ja.append(T.katakana(ch)); en.append(' ' + T.title_en(T.romanize(ch)) + ' ')
            i = j
    return ''.join(ja), re.sub(r'\s+', ' ', ''.join(en)).strip()


def kind_of(cate, name):
    c = (cate or '') + ' ' + (name or '')
    if '동물병원' in c or '메디컬' in c or '의료센터' in c: return 'vet'
    if '미용' in c or '그루밍' in c: return 'groom'
    if '놀이터' in c: return 'park'
    if '훈련' in c:  return 'train'
    return 'shop'

KIND = {'vet': ('動物病院', 'Veterinary clinic'), 'shop': ('ペットショップ', 'Pet shop'),
        'groom': ('トリミング', 'Grooming'), 'park': ('ドッグラン', 'Dog park'),
        'train': ('しつけ教室', 'Dog training')}

SIDO = {'ja': L.SIDO['서울특별시'][0], 'en': L.SIDO['서울특별시'][1], 'ko': '서울특별시'}

rows = []
for v in raw.values():
    ko = (v.get('name') or '').strip()
    if not ko:
        continue
    k = kind_of(v['cate'], ko)
    sj, se = segment(ko)
    # 「24시」は音写せず素直に読ませる
    sj = re.sub(r'24\s*シガン|24\s*シ(?![ャュョ])', '24時間', sj)
    se = re.sub(r'24\s*Sigan\b|24\s*Si\b', '24h', se)
    hp = (v.get('homepage') or '').strip()
    gu = v['gu']
    rows.append({
        'id': 'k' + str(v['cid']),
        'type': k,
        'ko': ko,
        'ja': ko if LATIN.match(ko) else sj,
        'en': ko if LATIN.match(ko) else se,
        'kind': {'ja': KIND[k][0], 'en': KIND[k][1]},
        'cate_ko': v['cate'],
        'sido': SIDO,
        'sigungu': {'ja': L.GU[gu][0], 'en': L.GU[gu][1], 'ko': gu},
        'addr': v['addr'],
        'tel': v['tel'],
        'insta': hp if 'instagram.com' in hp.lower() else '',
        'web': '' if (not hp or 'instagram.com' in hp.lower()) else hp,
        'lat': round(v['lat'], 6), 'lng': round(v['lng'], 6),
        'h24': bool(re.search(r'24\s*시', ko)),
        'rating': v.get('rating') or None,
        'reviews': v.get('reviews') or 0,
    })

rows.sort(key=lambda r: (r['type'] != 'vet', r['sigungu']['ko'], r['ko']))
json.dump(rows, open('../data/pets.json', 'w'), ensure_ascii=False, separators=(',', ':'))

from collections import Counter
print('pets', len(rows), Counter(r['type'] for r in rows))
print('24h vets', sum(1 for r in rows if r['type'] == 'vet' and r['h24']))
print('tel', sum(1 for r in rows if r['tel']), 'instagram', sum(1 for r in rows if r['insta']))
print('size KB', round(os.path.getsize('../data/pets.json') / 1024))
