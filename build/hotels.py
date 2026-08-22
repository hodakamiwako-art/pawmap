# -*- coding: utf-8 -*-
"""犬と泊まれる宿をカカオマップから集める。
   カカオの「ペット可」フラグが立っているものと、名前に애견/반려/펫が入るものを分けて記録する。"""
import urllib.request, urllib.parse, json, re, time, os

REGIONS = ['서울', '경기', '인천', '강원', '충북', '충남', '대전', '세종',
           '전북', '전남', '광주', '경북', '경남', '대구', '울산', '부산', '제주']
QUERIES = ['{r} 애견동반 펜션', '{r} 애견동반 호텔', '{r} 반려동물 동반 숙소',
           '{r} 애견펜션', '{r} 반려견 동반 호텔', '{r} 애견동반 리조트']
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
OUT = 'hotels_raw.json'
found = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}

PETNAME = re.compile(r'애견|반려|펫|독하우스|도그|dog|pet', re.I)

def search(q, page=1):
    u = "https://search.map.kakao.com/mapsearch/map.daum?" + urllib.parse.urlencode(
        {'q': q, 'msFlag': 'A', 'sort': 0, 'page': page})
    r = urllib.request.Request(u, headers={'User-Agent': UA, 'Referer': 'https://map.kakao.com/'})
    return json.loads(urllib.request.urlopen(r, timeout=20).read().decode('utf-8', 'ignore')).get('place') or []

def collect(q, maxpage=12):
    added = 0
    for pg in range(1, maxpage + 1):
        try:
            res = search(q, pg)
        except Exception:
            time.sleep(2)
            try: res = search(q, pg)
            except Exception: break
        if not res:
            break
        fresh = 0
        for p in res:
            cid = p.get('confirmid')
            addr = p.get('new_address') or p.get('address') or ''
            if not cid or cid in found: continue
            if p.get('cate_name_depth2') != '숙박': continue
            if not addr.startswith(('서울', '경기', '인천', '강원', '충청', '충북', '충남', '대전', '세종',
                                    '전라', '전북', '전남', '광주', '경상', '경북', '경남', '대구',
                                    '울산', '부산', '제주')):
                continue
            flag = (p.get('addinfo_pet') or '').strip()
            named = bool(PETNAME.search(p.get('name') or ''))
            if flag != 'Y' and not named:
                continue
            found[cid] = {
                'cid': cid, 'name': p.get('name'), 'tel': (p.get('tel') or '').strip(),
                'addr': addr, 'lat': float(p['lat']), 'lng': float(p['lon']),
                'cate': p.get('last_cate_name'),
                'homepage': (p.get('homepage') or '').strip(),
                'pet': 'flag' if flag == 'Y' else 'name',
                'rating': p.get('rating_average'), 'reviews': p.get('reviewCount'),
            }
            fresh += 1; added += 1
        if fresh == 0 and pg > 2:
            break
        time.sleep(0.28)
    return added

for i, r in enumerate(REGIONS):
    n = 0
    for tpl in QUERIES:
        n += collect(tpl.format(r=r))
    json.dump(found, open(OUT, 'w'), ensure_ascii=False)
    print(f'{i+1:2}/{len(REGIONS)} {r:4} +{n:4} total={len(found)}', flush=True)

json.dump(found, open(OUT, 'w'), ensure_ascii=False)
from collections import Counter
print('TOTAL', len(found))
print('evidence:', Counter(v['pet'] for v in found.values()))
print('categories:', Counter(v['cate'] for v in found.values()).most_common(10))
