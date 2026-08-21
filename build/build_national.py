# -*- coding: utf-8 -*-
"""全国2,597軒を places.json に組み立てる。

・地域は住所から 시도 / 시군구 の2階層で取る
・URL類はクライアント側で組み立てるので保存しない（ファイルを軽くするため）
"""
import json, re, math, os, sys
sys.path.insert(0, '.')
import translit as T
import lexicon as L
from ja import JA                       # 手で確認した100軒

OFF  = json.load(open('official_all.json',   encoding='utf-8'))
DC   = json.load(open('enrich_all.json',     encoding='utf-8'))
GEO  = json.load(open('geo_all.json',        encoding='utf-8')) if os.path.exists('geo_all.json') else {}
if os.path.exists('geo_pass2.json'):                 # 粗い当て直しの結果を重ねる
    for _k, _v in json.load(open('geo_pass2.json', encoding='utf-8')).items():
        if _v and not GEO.get(_k):
            GEO[_k] = _v
KAK  = json.load(open('kakao_all.json',      encoding='utf-8')) if os.path.exists('kakao_all.json') else {}
STA  = json.load(open('stations_all.json',   encoding='utf-8'))

LATIN  = re.compile(r'^[A-Za-z0-9 .,&\'\-!?/()]+$')
HANGUL = re.compile(r'[가-힣]')
LOAN_KEYS = sorted(L.LOAN, key=len, reverse=True)


def metres(a, b, c, d):
    R = 6371000.0; k = math.pi / 180
    dla = (c - a) * k; dlo = (d - b) * k
    x = math.sin(dla / 2) ** 2 + math.cos(a * k) * math.cos(c * k) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


# 駅は緯度で粗くふるいにかけてから距離を測る（1,435駅×2,597軒の総当たりを避ける）
STA.sort(key=lambda s: s['lat'])
STA_LAT = [s['lat'] for s in STA]
import bisect

def nearest_station(lat, lng):
    lo = bisect.bisect_left(STA_LAT, lat - 0.02)
    hi = bisect.bisect_right(STA_LAT, lat + 0.02)
    best, bd = None, 1e9
    for s in STA[lo:hi]:
        d = metres(lat, lng, s['lat'], s['lng'])
        if d < bd:
            best, bd = s, d
    if not best or bd > 1500:
        return None
    return {'ko': best['ko'], 'ja': best['ja'], 'en': best['en'], 'm': int(round(bd / 10) * 10)}


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


def latin_in(s):
    for m in re.findall(r'\(([^)]*)\)', s):
        m = m.strip()
        if m and LATIN.match(m) and re.search(r'[A-Za-z]', m):
            return m
    body = re.sub(r'\([^)]*\)', '', s).strip()
    if body and LATIN.match(body) and re.search(r'[A-Za-z]', body):
        return body
    return None


def region_of(addr):
    """住所から (시도, 시군구) を取る。세종は下位区分が無いのでそのまま扱う"""
    parts = (addr or '').split()
    sido = parts[0] if parts else ''
    if sido == '세종특별자치시':
        return sido, '세종특별자치시'
    sigungu = parts[1] if len(parts) > 1 else ''
    # 「수원시 팔달구」のように2語で1単位になる市がある
    if len(parts) > 2 and sigungu.endswith('시') and parts[2].endswith('구'):
        sigungu = sigungu + ' ' + parts[2]
    return sido, sigungu


def sigungu_label(ko):
    if not ko:
        return {'ja': '', 'en': '', 'ko': ''}
    if ko in L.GU:                                   # ソウルの区は漢字を持っている
        return {'ja': L.GU[ko][0], 'en': L.GU[ko][1], 'ko': ko}
    parts = ko.split()
    ja_bits, en_bits = [], []
    for w in parts:
        suf = w[-1]
        stem = w[:-1] if suf in L.SUFFIX_JA else w
        ja_bits.append(T.katakana(stem) + L.SUFFIX_JA.get(suf, ''))
        en_bits.append(T.title_en(T.romanize(stem)) + ('-' + T.romanize(suf) if suf in L.SUFFIX_JA else ''))
    return {'ja': ''.join(ja_bits), 'en': ' '.join(en_bits), 'ko': ko}


def dong_of(addr):
    m = re.findall(r'([가-힣]+동\d?가?)', addr or '')
    return m[-1] if m else ''


def area_romaji(ko):
    if not ko or not HANGUL.search(ko):
        return ko
    m = re.match(r'^(.*?)(동|가|로|길|읍|면|리)(\d*가?)$', ko)
    if m:
        head = T.title_en(T.romanize(m.group(1)))
        tail = T.romanize(m.group(2))
        num = m.group(3)
        return f'{head}-{tail}{(" " + num) if num else ""}'.strip()
    return T.title_en(T.romanize(ko))


def genre_of(cat, name, induty):
    hay = (cat or '') + ' ' + (name or '')
    for rx, gj, ge in L.GENRE_RULES:
        if re.search(rx, hay):
            return gj, ge
    return L.FALLBACK.get(induty, ('レストラン', 'Restaurant'))


def detail_of(cat):
    toks = [x.strip() for x in re.split(r'\s*,\s*', cat or '') if x.strip()]
    ja, en = [], []
    for x in toks:
        if x in L.FOOD:
            ja.append(L.FOOD[x][0]); en.append(L.FOOD[x][1])
        else:
            a, b = segment(x)
            ja.append(a); en.append(b)
    return '・'.join(dict.fromkeys(ja)), ', '.join(dict.fromkeys(en))


rows, skipped = [], []
for r in OFF:
    rn = r['rnum']
    key = str(rn)
    dc = DC.get(key)
    addr_off = r['siteAddr']
    sido_ko, sigungu_ko = region_of(addr_off)
    if sido_ko not in L.SIDO:
        skipped.append(r['bsshNm']); continue

    if dc:
        lat, lng, prec = dc['lat'], dc['lng'], 'shop'
    else:
        g = GEO.get(key)
        if not g:
            skipped.append(r['bsshNm']); continue
        lat, lng, prec = g['lat'], g['lng'], g['precision']

    if dc:
        base = dc['nm']; branch = (dc.get('branch') or '').strip()
        ko = (base + ' ' + branch).strip() if branch and branch not in base else base
    else:
        ko = re.sub(r'\([^)]*\)', '', r['bsshNm']).strip() or r['bsshNm'].strip()

    sj, se = segment(ko)
    en_paren = latin_in(r['bsshNm'])
    name_en = en_paren or (ko if LATIN.match(ko) else se)
    name_ja = ko if LATIN.match(ko) else sj

    cat = re.sub(r'<[^>]+>', '', (dc or {}).get('category') or '')
    gj, ge = genre_of(cat, ko, r['indutyNm'])
    dj, de = detail_of(cat)

    hand = JA.get(rn)
    if hand:
        name_ja = hand[0]
        gj = hand[1]
        if gj in L.NORMALISE:
            gj, ge = L.NORMALISE[gj]
        else:
            ge = next((x[2] for x in L.GENRE_RULES if x[1] == gj), ge)
        dj = hand[2] or dj
        head = re.sub(r'（.*', '', hand[3]).strip()
        kanji = head if re.search(r'[一-鿿]', head) else ''
        area_ko = hand[4]
        reading = T.katakana(area_ko) if HANGUL.search(area_ko) else ''
        area_ja = f'{kanji}（{reading}）' if (kanji and reading) else (reading or kanji)
        area_en = area_romaji(area_ko)
    else:
        d = dong_of((dc or {}).get('addr') or '') or dong_of(addr_off)
        area_ko = d
        area_ja = T.katakana(d) if d else ''
        area_en = area_romaji(d) if d else ''

    kw = [x['term'] for x in ((dc or {}).get('keyword') or [])]
    terrace = any(x in ' '.join(kw) for x in ['테라스', '야외', '정원', '루프탑', '야장'])
    road = re.sub(r'\(.*', '', (dc or {}).get('road_addr') or addr_off).strip()

    kk = KAK.get(key) or {}
    hp = (kk.get('homepage') or '').strip()

    rows.append({
        'id': rn,
        'kind': 'meal' if gj in L.MEAL_GENRES else 'cafe',
        'ko': ko, 'ja': name_ja, 'en': name_en,
        'genre': {'ja': gj, 'en': ge},
        'detail': {'ja': dj, 'en': de},
        'cat_ko': cat,
        'area': {'ja': area_ja, 'en': area_en, 'ko': area_ko},
        'sigungu': sigungu_label(sigungu_ko),
        'sido': {'ja': L.SIDO[sido_ko][0], 'en': L.SIDO[sido_ko][1], 'ko': sido_ko},
        'addr': road,
        'lat': round(lat, 6), 'lng': round(lng, 6), 'prec': prec,
        'terrace': terrace,
        'induty': {'ja': L.INDUTY[r['indutyNm']][0], 'en': L.INDUTY[r['indutyNm']][1]},
        'rating': (dc or {}).get('user_score') or None,
        'reviews': (dc or {}).get('review_cnt') or 0,
        'rid': (dc or {}).get('v_rid') or '',
        'insta': kk.get('instagram') or '',
        'web': '' if (not hp or 'instagram.com' in hp.lower()) else hp,
        'tel': kk.get('tel') or '',
        'station': nearest_station(lat, lng),
    })

rows.sort(key=lambda x: (x['sido']['ko'] != '서울특별시', x['sido']['ko'], x['sigungu']['ko'], x['ko']))
json.dump(rows, open('../data/places.json', 'w'), ensure_ascii=False, separators=(',', ':'))

from collections import Counter
print('places:', len(rows), 'skipped:', len(skipped), skipped[:5])
print('sido:', Counter(x['sido']['ja'] for x in rows).most_common())
print('kind:', Counter(x['kind'] for x in rows))
print('terrace:', sum(1 for x in rows if x['terrace']))
print('station:', sum(1 for x in rows if x['station']))
print('instagram:', sum(1 for x in rows if x['insta']), 'tel:', sum(1 for x in rows if x['tel']))
print('precision:', Counter(x['prec'] for x in rows))
print('size KB:', round(os.path.getsize('../data/places.json') / 1024))
