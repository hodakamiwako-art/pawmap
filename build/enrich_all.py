# -*- coding: utf-8 -*-
"""全国2,597軒を DiningCode で照合し、座標・料理カテゴリ・評価を得る"""
import urllib.request, urllib.parse, json, re, time, os

OFF = json.load(open('official_all.json', encoding='utf-8'))
OUT = 'enrich_all.json'
done = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}

# 486軒はすでに照合済み。使い回して時間を節約する
if os.path.exists('enriched2.json') and not done:
    prev = json.load(open('enriched2.json', encoding='utf-8'))
    for k, v in prev.items():
        if v.get('dc'):
            done[str(v['off']['rnum'])] = v['dc']
    print('reused from Seoul run:', len(done), flush=True)

def dc(q):
    data = urllib.parse.urlencode({'query': q, 'order': 'r_score', 'page': 1, 'size': 10,
                                   'search': q, 'mode': 'poi', 'dc_flag': 1}).encode()
    r = urllib.request.Request("https://im.diningcode.com/API/isearch/", data=data,
        headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.diningcode.com/',
                 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'})
    return json.load(urllib.request.urlopen(r, timeout=25))['result_data']['poi_section'].get('list') or []

def roadkey(a):
    m = re.search(r'([가-힣A-Za-z0-9]+(?:로|길)\d*(?:번길|안길|가길|나길|다길|길)?)\s*(\d+(?:-\d+)?)', a or '')
    return (m.group(1), m.group(2)) if m else None

def variants(raw, addr):
    base = re.sub(r'\(\s*(주|유|재|사)\s*\)|주식회사|㈜', '', raw).strip()
    nop = re.sub(r'\([^)]*\)', '', base).strip()
    inner = [x.strip() for x in re.findall(r'\(([^)]*)\)', base) if re.search(r'[가-힣]', x)]
    nobranch = re.sub(r'\s*[가-힣A-Za-z0-9]{1,6}점$', '', nop).strip()
    dong = re.findall(r'([가-힣]+동\d?가?)', addr or '')
    return [x for x in [nop, base] + inner + [nobranch,
            (nop + ' ' + dong[-1]) if dong else ''] if x and len(x) >= 2]

todo = [r for r in OFF if str(r['rnum']) not in done]
print('todo', len(todo), flush=True)
for i, r in enumerate(todo):
    rk = roadkey(r['siteAddr'])
    best = None
    seen = set()
    for q in variants(r['bsshNm'], r['siteAddr']):
        if q in seen: continue
        seen.add(q)
        try:
            lst = dc(q)
        except Exception:
            time.sleep(1.5)
            try: lst = dc(q)
            except Exception: lst = []
        for c in lst:
            ck = roadkey(c.get('road_addr') or '')
            if rk and ck and ck[0] == rk[0] and ck[1] == rk[1]:
                best = c; break
        if not best:
            for c in lst:
                ck = roadkey(c.get('road_addr') or '')
                if rk and ck and ck[0] == rk[0]:
                    best = c; break
        if best: break
        time.sleep(0.28)
    done[str(r['rnum'])] = best
    if i % 50 == 0:
        json.dump(done, open(OUT, 'w'), ensure_ascii=False)
        print(f'{i}/{len(todo)} matched={sum(1 for v in done.values() if v)}', flush=True)
    time.sleep(0.3)

json.dump(done, open(OUT, 'w'), ensure_ascii=False)
print('DONE matched', sum(1 for v in done.values() if v), '/', len(done))
