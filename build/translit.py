# -*- coding: utf-8 -*-
"""ハングル → カタカナ読み／ローマ字（文化観光部2000年式に準拠）

店名の多くは英語の音写（커피=coffee, 베이커리=bakery）なので、
まず借用語辞書で最長一致を試し、残りを機械的に音写する。
"""
import re

CHO = list('ᄀᄁᄂᄃᄄᄅᄆᄇᄈᄉᄊᄋᄌᄍᄎᄏᄐᄑᄒ')
JUNG = list('ᅡᅢᅣᅤᅥᅦᅧᅨᅩᅪᅫᅬᅭᅮᅯᅰᅱᅲᅳᅴᅵ')
JONG = [''] + list('ᆨᆩᆪᆫᆬᆭᆮᆯᆰᆱᆲᆳᆴᆵᆶᆷᆸᆹᆺᆻᆼᆽᆾᆿᇀᇁᇂ')

# --- ローマ字（Revised Romanization） -------------------------------------
CHO_R = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h']
JUNG_R = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i']
JONG_R = ['','k','k','k','n','n','n','t','l','k','m','p','t','t','p','t','m','p','p','t','t','ng','t','t','k','t','p','t']

# --- カタカナ -------------------------------------------------------------
# 語頭は清音、語中は濁音にする（ソウルの慣用に合わせる）
KA_HEAD = {'g':'カ','kk':'ッカ','n':'ナ','d':'タ','tt':'ッタ','r':'ラ','m':'マ','b':'パ','pp':'ッパ',
           's':'サ','ss':'ッサ','':'ア','j':'チャ','jj':'ッチャ','ch':'チャ','k':'カ','t':'タ','p':'パ','h':'ハ'}
KA_MID  = dict(KA_HEAD, **{'g':'ガ','d':'ダ','b':'バ','j':'ジャ'})

# 子音行 × 母音 のカタカナ表
ROWS = {
 'k':'カキクケコ', 'g':'ガギグゲゴ', 'n':'ナニヌネノ', 't':'タチトテト', 'd':'ダヂヅデド',
 'r':'ラリルレロ', 'm':'マミムメモ', 'p':'パピプペポ', 'b':'バビブベボ', 's':'サシスセソ',
 'h':'ハヒフヘホ', '':'アイウエオ',
}
VOWEL_JA = {   # ローマ字母音 → (基本カナ, 拗音ベース)
 'a':('ア','ャ'), 'ae':('エ','ェ'), 'ya':('ヤ',None), 'yae':('イェ',None),
 'eo':('オ','ョ'), 'e':('エ','ェ'), 'yeo':('ヨ',None), 'ye':('イェ',None),
 'o':('オ','ョ'), 'wa':('ワ',None), 'wae':('ウェ',None), 'oe':('ウェ',None),
 'yo':('ヨ',None), 'u':('ウ','ュ'), 'wo':('ウォ',None), 'we':('ウェ',None),
 'wi':('ウィ',None), 'yu':('ユ',None), 'eu':('ウ','ュ'), 'ui':('ウィ',None), 'i':('イ','ィ'),
}
BASE_IDX = {'a':0,'i':1,'u':2,'e':3,'o':4}
JONG_JA = {'':'','k':'ク','n':'ン','t':'ッ','l':'ル','m':'ム','p':'プ','ng':'ン'}

# ㅡ は子音ごとに落ち着く先が違う（드→ド, 스→ス, 크→ク）
EU_JA = {'g':'グ','k':'ク','n':'ヌ','d':'ド','t':'ト','r':'ル','m':'ム',
         'b':'ブ','p':'プ','s':'ス','h':'フ','':'ウ'}
# ㅜ も d/t だけは拗音気味にする（두→ドゥ, 투→トゥ）
U_JA  = {'d':'ドゥ','t':'トゥ'}

# 終声が次の音節の初声（ㅇ）へ渡る連音を先に解決する
JONG2CHO = {1:0, 2:1, 4:2, 7:3, 8:5, 16:6, 17:7, 19:9, 20:10, 22:12, 23:14, 24:15, 25:16, 26:17}


def decompose(ch):
    c = ord(ch) - 0xAC00
    if not (0 <= c < 11172):
        return None
    return c // 588, (c % 588) // 28, c % 28


def _syl_kana(cho_r, jung_r, jong_r, head):
    """1音節をカタカナに"""
    # 拗音になる子音（チャ行・ジャ行）
    if cho_r in ('j', 'jj', 'ch'):
        stem = 'ジ' if (cho_r == 'j' and not head) else 'チ'
        pre = 'ッ' if cho_r == 'jj' else ''
        v = jung_r
        table = {'a':'ャ','ae':'ェ','ya':'ャ','yae':'ェ','eo':'ョ','e':'ェ','yeo':'ョ','ye':'ェ',
                 'o':'ョ','yo':'ョ','u':'ュ','yu':'ュ','eu':'ュ','i':'','ui':'','wi':'ュイ',
                 'wa':'ュア','wo':'ョ','we':'ェ','wae':'ェ','oe':'ェ'}
        kana = pre + stem + table.get(v, '')
        return kana + JONG_JA.get(jong_r, '')

    # 子音行の決定
    cons = {'g':'g' if not head else 'k', 'kk':'k', 'n':'n', 'd':'d' if not head else 't', 'tt':'t',
            'r':'r', 'm':'m', 'b':'b' if not head else 'p', 'pp':'p', 's':'s', 'ss':'s',
            '':'', 'k':'k', 't':'t', 'p':'p', 'h':'h'}[cho_r]
    pre = 'ッ' if cho_r in ('kk','tt','pp','ss') else ''
    row = ROWS.get(cons, ROWS[''])
    base, small = VOWEL_JA[jung_r]

    if jung_r == 'u' and cons in U_JA:
        kana = U_JA[cons]
    elif jung_r in ('a','i','u','e','o'):
        kana = row[BASE_IDX[jung_r]]
    elif jung_r in ('eo',):
        kana = row[BASE_IDX['o']]
    elif jung_r in ('eu',):
        kana = EU_JA.get(cons, row[BASE_IDX['u']])
    elif jung_r in ('ae','e'):
        kana = row[BASE_IDX['e']]
    elif jung_r in ('ya','yeo','yo','yu'):
        v = {'ya':'a','yeo':'o','yo':'o','yu':'u'}[jung_r]
        kana = (row[BASE_IDX['i']] + {'a':'ャ','o':'ョ','u':'ュ'}[v]) if cons else base
    elif jung_r in ('yae','ye'):
        kana = (row[BASE_IDX['i']] + 'ェ') if cons else 'イェ'
    elif jung_r in ('wa','wae','wo','we','wi','oe','ui'):
        tail = {'wa':'ワ','wae':'ェ','wo':'ォ','we':'ェ','wi':'ィ','oe':'ェ','ui':'ィ'}[jung_r]
        if not cons:
            kana = base
        elif jung_r == 'wa':
            kana = row[BASE_IDX['u']] + 'ァ'
        else:
            kana = row[BASE_IDX['u']] + tail
    else:
        kana = base
    return pre + kana + JONG_JA.get(jong_r, '')


def _syllables(text):
    """文字列を (初声, 中声, 終声) または生文字の並びにし、連音を解決する"""
    syls = [decompose(ch) or ch for ch in text]
    for i in range(len(syls) - 1):
        a, b = syls[i], syls[i + 1]
        if isinstance(a, tuple) and isinstance(b, tuple) and a[2] and b[0] == 11:
            if a[2] in JONG2CHO:
                syls[i] = (a[0], a[1], 0)
                syls[i + 1] = (JONG2CHO[a[2]], b[1], b[2])
            elif a[2] == 27:                      # ㅎ は消える
                syls[i] = (a[0], a[1], 0)
    return syls


def romanize(text):
    out = []
    for s in _syllables(text):
        if not isinstance(s, tuple):
            out.append(s)
            continue
        i, j, k = s
        out.append(CHO_R[i] + JUNG_R[j] + JONG_R[k])
    return ''.join(out)


def katakana(text):
    out, prev_hangul = [], False
    for s in _syllables(text):
        if not isinstance(s, tuple):
            out.append(s)
            prev_hangul = False
            continue
        i, j, k = s
        out.append(_syl_kana(CHO_R[i], JUNG_R[j], JONG_R[k], not prev_hangul))
        prev_hangul = True
    return ''.join(out)


def title_en(s):
    """romanized string → Title Case"""
    return re.sub(r'\b([a-z])', lambda m: m.group(1).upper(), s)
