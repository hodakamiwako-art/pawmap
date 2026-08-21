# -*- coding: utf-8 -*-
"""1回目で当たらなかった住所を、番地→通り→洞→市郡区 と粗くしながら当てる"""
import json, re, urllib.parse, urllib.request, time, os
OFF = json.load(open('official_all.json', encoding='utf-8'))
DC  = json.load(open('enrich_all.json', encoding='utf-8'))
GEO = json.load(open('geo_all.json', encoding='utf-8'))
OUT = 'geo_pass2.json'
done = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}

FIX = {'전남광주통합특별시': '', '강원특별자치도': '강원도', '전북특별자치도': '전라북도',
       '제주특별자치도': '제주도'}

def norm(a):
    a = re.sub(r'\(.*', '', a).strip()
    for k, v in FIX.items():
        if a.startswith(k):
            a = (v + a[len(k):]).strip()
    return a

def dong_of(raw):
    m = re.findall(r'([가-힣]+동\d?가?|[가-힣]+읍|[가-힣]+면|[가-힣]+리)', raw or '')
    return m[-1] if m else ''

def q(u):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {'q': u, 'format': 'json', 'limit': 1, 'countrycodes': 'kr'})
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(
            url, headers={'User-Agent': 'pawmap/1.0 (dog-friendly korea map)'}), timeout=25))
    except Exception:
        return []

todo = [r for r in OFF if not DC.get(str(r['rnum'])) and not GEO.get(str(r['rnum']))
        and str(r['rnum']) not in done]
print('pass2 todo', len(todo), flush=True)
for i, r in enumerate(todo):
    full = norm(r['siteAddr'])
    parts = full.split()
    head = ' '.join(parts[:2])                      # 시도 + 시군구
    road = re.sub(r'\s*\d+(-\d+)?\s*$', '', full)   # 番地を落とす
    dong = dong_of(r['siteAddr'])
    tries = [(full, 'street'), (road, 'street'),
             ((head + ' ' + dong).strip() if dong else '', 'area'), (head, 'area')]
    got = None
    for u, prec in tries:
        if not u: continue
        d = q(u)
        if d:
            got = {'lat': float(d[0]['lat']), 'lng': float(d[0]['lon']), 'precision': prec}
            break
        time.sleep(1.05)
    done[str(r['rnum'])] = got
    if i % 20 == 0:
        json.dump(done, open(OUT, 'w'), ensure_ascii=False)
        print(f'{i}/{len(todo)} ok={sum(1 for v in done.values() if v)}', flush=True)
    time.sleep(1.05)
json.dump(done, open(OUT, 'w'), ensure_ascii=False)
print('DONE pass2', sum(1 for v in done.values() if v), '/', len(done))
