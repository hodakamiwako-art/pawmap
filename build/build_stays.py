# -*- coding: utf-8 -*-
"""犬と泊まれる宿を stays.json に組み立てる"""
import json, re, os, sys
sys.path.insert(0, '.')
import translit as T
import lexicon as L

raw = json.load(open('hotels_raw.json', encoding='utf-8'))

EXTRA = {
 '펜션': ('ペンション', 'Pension'), '호텔': ('ホテル', 'Hotel'), '리조트': ('リゾート', 'Resort'),
 '모텔': ('モーテル', 'Motel'), '게스트하우스': ('ゲストハウス', 'Guesthouse'),
 '캠핑장': ('キャンプ場', 'Campsite'), '카라반': ('カラバン', 'Caravan'),
 '글램핑': ('グランピング', 'Glamping'), '풀빌라': ('プールヴィラ', 'Pool Villa'),
 '빌라': ('ヴィラ', 'Villa'), '스테이': ('ステイ', 'Stay'), '독채': ('一棟貸し', 'Whole House'),
 '애견': ('愛犬', 'Dog'), '반려견': ('伴侶犬', 'Dog'), '반려동물': ('伴侶動物', 'Pet'),
 '동반': ('同伴', 'Friendly'), '펫': ('ペット', 'Pet'),
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


KIND = {
 '펜션': ('ペンション', 'Pension'), '호텔': ('ホテル', 'Hotel'),
 '여관,모텔': ('モーテル', 'Motel'), '리조트': ('リゾート', 'Resort'),
 '야영,캠핑장': ('キャンプ場', 'Campsite'), '카라반': ('カラバン', 'Caravan'),
 '게스트하우스': ('ゲストハウス', 'Guesthouse'), '민박': ('民宿', 'Minbak'),
 '숙박': ('宿泊施設', 'Accommodation'),
}

# 住所の先頭から 시도 を引き当てる（カカオは略称で返してくる）
SIDO_BY_PREFIX = [
 ('서울', '서울특별시'), ('경기', '경기도'), ('인천', '인천광역시'), ('강원', '강원특별자치도'),
 ('충북', '충청북도'), ('충청북', '충청북도'), ('충남', '충청남도'), ('충청남', '충청남도'),
 ('대전', '대전광역시'), ('세종', '세종특별자치시'), ('전북', '전북특별자치도'),
 ('전라북', '전북특별자치도'), ('전남', '전남광주통합특별시'), ('전라남', '전남광주통합특별시'),
 ('광주', '전남광주통합특별시'), ('경북', '경상북도'), ('경상북', '경상북도'),
 ('경남', '경상남도'), ('경상남', '경상남도'), ('대구', '대구광역시'),
 ('울산', '울산광역시'), ('부산', '부산광역시'), ('제주', '제주특별자치도'),
]


def region_of(addr):
    parts = (addr or '').split()
    if not parts:
        return None, ''
    sido = None
    for pre, full in SIDO_BY_PREFIX:
        if parts[0].startswith(pre):
            sido = full; break
    if not sido:
        return None, ''
    if sido == '세종특별자치시':
        return sido, '세종특별자치시'
    sg = parts[1] if len(parts) > 1 else ''
    if len(parts) > 2 and sg.endswith('시') and parts[2].endswith('구'):
        sg = sg + ' ' + parts[2]
    return sido, sg


def sigungu_label(ko):
    if not ko:
        return {'ja': '', 'en': '', 'ko': ''}
    if ko in L.GU:
        return {'ja': L.GU[ko][0], 'en': L.GU[ko][1], 'ko': ko}
    ja_bits, en_bits = [], []
    for w in ko.split():
        suf = w[-1]
        stem = w[:-1] if suf in L.SUFFIX_JA else w
        ja_bits.append(T.katakana(stem) + L.SUFFIX_JA.get(suf, ''))
        en_bits.append(T.title_en(T.romanize(stem)) + ('-' + T.romanize(suf) if suf in L.SUFFIX_JA else ''))
    return {'ja': ''.join(ja_bits), 'en': ' '.join(en_bits), 'ko': ko}


rows, skipped = [], 0
for v in raw.values():
    ko = (v.get('name') or '').strip()
    if not ko:
        continue
    sido_ko, sg_ko = region_of(v['addr'])
    if not sido_ko:
        skipped += 1; continue
    sj, se = segment(ko)
    hp = (v.get('homepage') or '').strip()
    cate = v.get('cate') or '숙박'
    kind = KIND.get(cate) or (('ペンション', 'Pension') if '펜션' in cate else
                              ('ホテル', 'Hotel') if '호텔' in cate else ('宿泊施設', 'Accommodation'))
    rows.append({
        'id': 'h' + str(v['cid']),
        'ko': ko,
        'ja': ko if LATIN.match(ko) else sj,
        'en': ko if LATIN.match(ko) else se,
        'kind': {'ja': kind[0], 'en': kind[1]},
        'cate_ko': cate,
        'sido': {'ja': L.SIDO[sido_ko][0], 'en': L.SIDO[sido_ko][1], 'ko': sido_ko},
        'sigungu': sigungu_label(sg_ko),
        'addr': v['addr'],
        'tel': v['tel'],
        'insta': hp if 'instagram.com' in hp.lower() else '',
        'web': '' if (not hp or 'instagram.com' in hp.lower()) else hp,
        'lat': round(v['lat'], 6), 'lng': round(v['lng'], 6),
        'pet': v['pet'],                       # flag = 地図データに明記 / name = 店名から
        'rating': v.get('rating') or None,
        'reviews': v.get('reviews') or 0,
    })

rows.sort(key=lambda r: (r['sido']['ko'] != '서울특별시', r['sido']['ko'], r['sigungu']['ko'], r['ko']))
json.dump(rows, open('../data/stays.json', 'w'), ensure_ascii=False, separators=(',', ':'))

from collections import Counter
print('stays', len(rows), 'skipped(region unknown)', skipped)
print('evidence:', Counter(r['pet'] for r in rows))
print('kind:', Counter(r['kind']['ja'] for r in rows).most_common())
print('sido:', Counter(r['sido']['ja'] for r in rows).most_common())
print('tel', sum(1 for r in rows if r['tel']), 'size KB', round(os.path.getsize('../data/stays.json') / 1024))
