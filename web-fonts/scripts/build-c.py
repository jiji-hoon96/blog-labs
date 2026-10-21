"""Builds c-subset-woff2: the same TTF as b-full-woff2, cut with
fontTools into the exact unicode-range slices d-google-variable uses.

Google's slices (D) are a variable font, one file per slice for every
weight. C shares B's static source and D's ranges, so B -> C isolates
subsetting.

    python3 scripts/build-c.py   # downloads the two TTFs, writes c-subset-woff2/
"""
import io
import os
import re
import sys
import urllib.request
from concurrent.futures import ProcessPoolExecutor

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'c-subset-woff2')
TTFS = {
    400: 'https://fonts.gstatic.com/s/notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf',
    700: 'https://fonts.gstatic.com/s/notosanskr/v40/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf',
}


def ranges():
    css = open(os.path.join(ROOT, 'd-google-variable', 'fonts.css')).read()
    blocks = re.findall(r'font-weight: (\d+);.*?unicode-range: ([^;]+);', css, re.S)
    out = {}
    for w, r in blocks:
        out.setdefault(int(w), []).append(r.strip())
    return out


def parse(r):
    cps = set()
    for part in r.split(','):
        part = part.strip()[2:]
        a, _, b = part.partition('-')
        cps.update(range(int(a, 16), int(b or a, 16) + 1))
    return cps


def cut(args):
    weight, i, r, path = args
    font = TTFont(path)
    opts = subset.Options()
    opts.flavor = 'woff2'
    s = subset.Subsetter(opts)
    s.populate(unicodes=parse(r))
    s.subset(font)
    name = f'nskr-{weight}-{i}.woff2'
    font.flavor = 'woff2'
    font.save(os.path.join(OUT, name))
    return weight, i, r, name


if __name__ == '__main__':
    paths = {}
    for w, url in TTFS.items():
        p = os.path.join(OUT, f'.src-{w}.ttf')
        if not os.path.exists(p):
            urllib.request.urlretrieve(url, p)
        paths[w] = p
    jobs = [(w, i, r, paths[w]) for w, rs in ranges().items() for i, r in enumerate(rs)]
    with ProcessPoolExecutor() as ex:
        done = sorted(ex.map(cut, jobs))
    rules = []
    for w, i, r, name in done:
        rules.append(f"""@font-face {{
  font-family: 'Noto Sans KR';
  font-style: normal;
  font-weight: {w};
  font-display: swap;
  src: url({name}) format('woff2');
  unicode-range: {r};
}}""")
    open(os.path.join(OUT, 'fonts.css'), 'w').write('\n'.join(rules) + '\n')
    for p in paths.values():
        os.remove(p)
    print('wrote', len(done), 'slices', file=sys.stderr)
