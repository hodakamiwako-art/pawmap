# -*- coding: utf-8 -*-
"""動物病院のサイトを実際に読み、日本語／英語対応の証拠を探す。
   推測はしない。見つかった根拠だけを記録する。"""
import json, re, urllib.request, urllib.parse, os
from concurrent.futures import ThreadPoolExecutor

PETS = json.load(open('../data/pets.json', encoding='utf-8'))
VETS = [p for p in PETS if p['type'] == 'vet' and (p['web'] or p['insta'])]
OUT = 'vet_lang.json'
done = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
KANA = re.compile(r'[぀-ゟ゠-ヿ]')          # ひらがな・カタカナ
JA_WORD = re.compile(r'日本語|日本人|にほんご')
EN_PAGE = re.compile(r'href=["\'][^"\']*(?:/en/|/en\b|/english|lang=en|=eng\b)', re.I)
EN_CLAIM = re.compile(r'english\s*(?:speaking|available|consultation|service|ok)'
                      r'|we\s+speak\s+english|영어\s*(?:진료|상담|가능|응대)'
                      r'|english\s*진료', re.I)
JA_CLAIM = re.compile(r'일본어\s*(?:진료|상담|가능|응대)|japanese\s*(?:speaking|available)', re.I)

def fetch(url, timeout=12):
    try:
        r = urllib.request.Request(url, headers={'User-Agent': UA,
                                                 'Accept-Language': 'ja,en;q=0.8,ko;q=0.6'})
        raw = urllib.request.urlopen(r, timeout=timeout).read()[:400000]
        return raw.decode('utf-8', 'ignore')
    except Exception:
        return ''

def strip(html):
    h = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', html)
    return re.sub(r'<[^>]+>', ' ', h)

def check(p):
    urls = [u for u in (p['web'], p['insta']) if u]
    ev_ja, ev_en = [], []
    for u in urls:
        html = fetch(u)
        if not html:
            continue
        text = strip(html)
        if JA_CLAIM.search(text) or JA_CLAIM.search(html):
            ev_ja.append('claim')
        elif JA_WORD.search(text):
            ev_ja.append('mention')
        elif len(KANA.findall(text)) >= 20:      # 日本語のページがある
            ev_ja.append('page')
        if EN_CLAIM.search(text) or EN_CLAIM.search(html):
            ev_en.append('claim')
        elif EN_PAGE.search(html):
            ev_en.append('page')
    return {'ja': ev_ja[0] if ev_ja else None,
            'en': ev_en[0] if ev_en else None,
            'checked': True}

todo = [p for p in VETS if p['id'] not in done]
print('vets with a URL:', len(VETS), ' to check:', len(todo), flush=True)
with ThreadPoolExecutor(max_workers=6) as ex:
    for i, (p, res) in enumerate(zip(todo, ex.map(check, todo))):
        done[p['id']] = res
        if i % 40 == 0:
            json.dump(done, open(OUT, 'w'), ensure_ascii=False)
            print(f"{i}/{len(todo)} ja={sum(1 for v in done.values() if v['ja'])} "
                  f"en={sum(1 for v in done.values() if v['en'])}", flush=True)
json.dump(done, open(OUT, 'w'), ensure_ascii=False)
from collections import Counter
print('DONE checked', len(done))
print(' ja:', Counter(v['ja'] for v in done.values()))
print(' en:', Counter(v['en'] for v in done.values()))
