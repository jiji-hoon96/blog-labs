"""Builds the four-weight set (300, 400, 500, 700) next to the two-weight one.

Same four variants, one change: the page uses four weights instead of two.
The 400 and 700 files are copied from the two-weight folders rather than
rebuilt, because fontTools' woff2 output drifts by a few hundred bytes
between runs and the two-weight numbers must stay as measured.

    python3 scripts/build-4w.py   # needs fontTools and brotli

Writes a-pinned-ttf-4w/, b-full-woff2-4w/, c-subset-woff2-4w/, d-google-variable-4w/.
Run scripts/build-pages.mjs afterwards for the HTML.
"""
import os
import re
import shutil
import sys
import urllib.request
from concurrent.futures import ProcessPoolExecutor

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
WEIGHTS = [300, 400, 500, 700]
NEW = [300, 500]
API = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap'
CHROME_UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
             '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')


def fetch(url, ua=None):
    req = urllib.request.Request(url, headers={'User-Agent': ua} if ua else {})
    return urllib.request.urlopen(req).read().decode()


def rule(weight, src, fmt, rng=None):
    out = f"""@font-face {{
  font-family: 'Noto Sans KR';
  font-style: normal;
  font-weight: {weight};
  font-display: swap;
  src: url({src}) format('{fmt}');"""
    if rng:
        out += f'\n  unicode-range: {rng};'
    return out + '\n}'


def parse(r):
    cps = set()
    for part in r.split(','):
        part = part.strip()[2:]
        a, _, b = part.partition('-')
        cps.update(range(int(a, 16), int(b or a, 16) + 1))
    return cps


def cut(args):
    weight, i, r, path, out = args
    font = TTFont(path)
    opts = subset.Options()
    opts.flavor = 'woff2'
    s = subset.Subsetter(opts)
    s.populate(unicodes=parse(r))
    s.subset(font)
    font.flavor = 'woff2'
    font.save(os.path.join(out, f'nskr-{weight}-{i}.woff2'))


def folder(name):
    path = os.path.join(ROOT, name)
    os.makedirs(path, exist_ok=True)
    return path


if __name__ == '__main__':
    # A: what the API hands a client it doesn't recognise. Four static TTFs.
    a_css = fetch(API)
    ttfs = dict(zip(map(int, re.findall(r'font-weight: (\d+);', a_css)),
                    re.findall(r'src: url\(([^)]+\.ttf)\)', a_css)))
    assert sorted(ttfs) == WEIGHTS, ttfs
    a = folder('a-pinned-ttf-4w')
    open(os.path.join(a, 'fonts.css'), 'w').write(
        '\n'.join(rule(w, ttfs[w], 'truetype') for w in WEIGHTS) + '\n')

    # D: what the API hands Chrome. Same 124 variable files, now 496 rules.
    d_css = fetch(API, CHROME_UA)
    d = folder('d-google-variable-4w')
    open(os.path.join(d, 'fonts.css'), 'w').write(d_css)
    blocks = re.findall(r'font-weight: (\d+);.*?unicode-range: ([^;]+);', d_css, re.S)
    ranges = {}
    for w, r in blocks:
        ranges.setdefault(int(w), []).append(r.strip())
    assert all(ranges[w] == ranges[400] for w in WEIGHTS), 'ranges differ by weight'

    # Source TTFs for the two new weights.
    tmp = folder('.src-4w')
    src = {}
    for w in NEW:
        p = os.path.join(tmp, f'{w}.ttf')
        if not os.path.exists(p):
            urllib.request.urlretrieve(ttfs[w], p)
        src[w] = p

    # B: the same TTFs as woff2, no subsetting.
    b = folder('b-full-woff2-4w')
    for w in (400, 700):
        shutil.copy(os.path.join(ROOT, 'b-full-woff2', f'noto-sans-kr-{w}.woff2'), b)
    for w in NEW:
        font = TTFont(src[w])
        font.flavor = 'woff2'
        font.save(os.path.join(b, f'noto-sans-kr-{w}.woff2'))
    open(os.path.join(b, 'fonts.css'), 'w').write(
        '/* Same TTFs as a-pinned-ttf-4w, converted to woff2 with fontTools. No subsetting. */\n'
        + '\n'.join(rule(w, f'noto-sans-kr-{w}.woff2', 'woff2') for w in WEIGHTS) + '\n')

    # C: the same TTFs cut into Google's ranges, one static file per weight per range.
    c = folder('c-subset-woff2-4w')
    for w in (400, 700):
        for i in range(len(ranges[w])):
            shutil.copy(os.path.join(ROOT, 'c-subset-woff2', f'nskr-{w}-{i}.woff2'), c)
    jobs = [(w, i, r, src[w], c) for w in NEW for i, r in enumerate(ranges[w])]
    with ProcessPoolExecutor() as ex:
        list(ex.map(cut, jobs))
    open(os.path.join(c, 'fonts.css'), 'w').write(
        '\n'.join(rule(w, f'nskr-{w}-{i}.woff2', 'woff2', r)
                  for w in WEIGHTS for i, r in enumerate(ranges[w])) + '\n')

    shutil.rmtree(tmp)
    print('wrote 4w variants:', len(jobs), 'new slices', file=sys.stderr)
