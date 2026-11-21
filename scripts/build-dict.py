"""
从 ECDICT（https://github.com/skywind3000/ECDICT，MIT 许可）生成内置的常用词词典。

用法：
  1. 下载 ecdict.csv（约 66 MB）：
     curl -L -o ecdict.csv https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
  2. python3 scripts/build-dict.py ecdict.csv public/dict/ecdict-common.json

收录规则：有中文释义，并且（带考试标签 zk/gk/cet4/cet6/ky/toefl/ielts/gre，或 BNC / 当代语料库词频前 50000）。
输出格式：
  {
    "v": 1,
    "words": { "linger": ["/ˈliŋɡə/", "vi. 逗留, 消磨, 徘徊\\nvt. 消磨"], ... },   # 小写词 → [音标, 释义]
    "forms": { "lingered": "linger", "atrophies": "atrophy", ... }              # 词形变化 → 原形
  }
"""
import csv
import json
import re
import sys

RANK = 50000
POS_FIX = {'a.': 'adj.', 'ad.': 'adv.'}  # ECDICT 用 a. / ad.，统一成更常见的写法
# exchange 字段里表示“变形”的类型：p 过去式 d 过去分词 i 现在分词 3 第三人称单数 s 复数 r 比较级 t 最高级
FORM_TYPES = set('pdi3srt')


def is_common(r):
    bnc, frq = int(r['bnc'] or 0), int(r['frq'] or 0)
    return r['tag'].strip() or 0 < bnc <= RANK or 0 < frq <= RANK


def clean_phonetic(p):
    """ECDICT 的音标用 ' 和 , 表示重读、: 表示长音；转成标准 IPA 符号，只保留第一种读音"""
    p = re.split(r';|, ', p.strip())[0].strip()
    if not p:
        return None
    p = p.replace("'", 'ˈ').replace(',', 'ˌ').replace(':', 'ː').replace('ә', 'ə').replace('g', 'ɡ')
    return f'/{p}/'


def clean_translation(t):
    """按行拆分；去掉 [网络] [医] [计] 这类网络释义 / 专业领域释义（只有它们时才保留）；统一词性缩写"""
    lines = [l.strip() for l in t.replace('\\n', '\n').split('\n') if l.strip()]
    general = [l for l in lines if not l.startswith('[')] or lines
    out = []
    for l in general[:4]:  # 最多 4 行，气泡里放得下
        head, _, rest = l.partition(' ')
        out.append(f'{POS_FIX[head]} {rest}' if head in POS_FIX else l)
    return '\n'.join(out)


def main(src, dst):
    words, exchanges = {}, {}
    with open(src, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if not r['translation'].strip() or not is_common(r):
                continue
            key = r['word'].strip().lower()
            # 大小写不同的重复词条（May / may）：优先保留全小写的那条
            if key in words and r['word'] != key:
                continue
            words[key] = [clean_phonetic(r['phonetic']), clean_translation(r['translation'])]
            exchanges[key] = r['exchange']

    forms = {}
    for lemma, ex in exchanges.items():
        for part in ex.split('/'):
            kind, _, form = part.partition(':')
            form = form.strip().lower()
            # 变形本身就是独立词条的（比如 wrestling），直接查词条，不需要映射
            if kind in FORM_TYPES and form and form != lemma and form not in words:
                forms.setdefault(form, lemma)

    data = {'v': 1, 'words': words, 'forms': forms}
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'words: {len(words)}  forms: {len(forms)}  -> {dst}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
