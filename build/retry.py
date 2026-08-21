import urllib.request,urllib.parse,json,re,time,os
E=json.load(open('enriched.json',encoding='utf-8'))
OUT='retry.json'
done=json.load(open(OUT,encoding='utf-8')) if os.path.exists(OUT) else {}

def dc(q):
    data=urllib.parse.urlencode({'query':q,'order':'r_score','page':1,'size':10,'search':q,'mode':'poi','dc_flag':1}).encode()
    r=urllib.request.Request("https://im.diningcode.com/API/isearch/",data=data,
        headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.diningcode.com/','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'})
    return json.load(urllib.request.urlopen(r,timeout=25))['result_data']['poi_section'].get('list') or []

def roadkey(a):
    m=re.search(r'([가-힣A-Za-z0-9]+(?:로|길)\d*(?:번길|안길|가길|나길|다길|길)?)\s*(\d+(?:-\d+)?)', a or '')
    return (m.group(1),m.group(2)) if m else None
def gu(a):
    m=re.search(r'서울특별시\s+(\S+구)', a or ''); return m.group(1) if m else ''
def dong(a):
    m=re.findall(r'([가-힣]+동\d?가?)', a or ''); return m[-1] if m else ''

todo=[k for k,v in E.items() if not v['dc'] and k not in done]
print('retrying',len(todo),flush=True)
for i,k in enumerate(todo):
    off=E[k]['off']; raw=off['bsshNm']; rk=roadkey(off['siteAddr'])
    # several ways to spell the same shop
    cands_q=[]
    base=re.sub(r'\((주|유|재|사)\)|주식회사|㈜','',raw).strip()
    inner=re.findall(r'\(([^)]*)\)', base)
    nop=re.sub(r'\([^)]*\)','',base).strip()
    cands_q += [nop, base]
    cands_q += [x.strip() for x in inner if re.search(r'[가-힣]', x)]
    cands_q += [re.sub(r'\s*[가-힣A-Za-z0-9]{1,6}점$','',nop).strip()]
    cands_q += [nop+' '+gu(off['siteAddr']), nop+' '+dong(off['siteAddr'])]
    seen=set(); best=None; ncand=0
    for q in cands_q:
        if not q or q in seen or len(q)<2: continue
        seen.add(q)
        try: lst=dc(q)
        except Exception: time.sleep(1.5); 
        else:
            ncand+=len(lst)
            for c in lst:
                ck=roadkey(c.get('road_addr') or '')
                if rk and ck and ck[0]==rk[0] and ck[1]==rk[1]: best=c; break
            if not best:
                for c in lst:
                    ck=roadkey(c.get('road_addr') or '')
                    if rk and ck and ck[0]==rk[0]: best=c; break
        if best: break
        time.sleep(0.3)
    done[k]={'dc':best,'ncand':ncand}
    if i%20==0:
        json.dump(done,open(OUT,'w'),ensure_ascii=False)
        print(i,raw[:18],'->',(best or {}).get('category'),flush=True)
json.dump(done,open(OUT,'w'),ensure_ascii=False)
print('recovered',sum(1 for v in done.values() if v['dc']),'/',len(done))
