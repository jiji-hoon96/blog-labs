"""Builds the composite set: one long page that uses four font families at once.

    body    Inter first, then Noto Sans KR. Inter draws Latin letters, digits
            and spaces. Noto Sans KR draws Hangul. Weights 300, 400, 500, 700.
    italic  blockquotes. Inter has a real italic. Noto Sans KR has none, so the
            Hangul inside a blockquote is slanted by the browser.
    h1, h2  Noto Serif KR 700.
    code    JetBrains Mono 400, then Noto Sans KR for Hangul comments.

Every family goes through the same four delivery methods as the other sets:

    full-a-ttf       the TTF URLs the API hands an unknown client, self-hosted
    full-b-woff2     the same TTFs as woff2, no subsetting
    full-c-subset    the same TTFs cut into the ranges Google uses for each family
    full-d-google    the CSS the API hands Chrome, files self-hosted
    full-d-range     the same API asked for weight ranges instead of a list

All files are self-hosted so the deployed comparison has one host and one
protocol. Noto Sans KR files for A, B, C are copied from the -4w folders
because fontTools' woff2 output drifts between runs. D's Noto Sans KR CSS is
the one saved in d-google-variable-4w.

    python3 scripts/build-full.py   # needs fontTools and brotli
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
CHROME_UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
             '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')
API = 'https://fonts.googleapis.com/css2?family={}&display=swap'

# slug, family, list request, range request
FAMILIES = [
    ('nskr', 'Noto Sans KR', 'Noto+Sans+KR:wght@300;400;500;700', 'Noto+Sans+KR:wght@300..700'),
    ('inter', 'Inter', 'Inter:ital,wght@0,300;0,400;0,500;0,700;1,400', 'Inter:ital,wght@0,300..700;1,400'),
    ('serif', 'Noto Serif KR', 'Noto+Serif+KR:wght@700', 'Noto+Serif+KR:wght@700'),
    ('mono', 'JetBrains Mono', 'JetBrains+Mono:wght@400', 'JetBrains+Mono:wght@400'),
]


def fetch(url, ua=None):
    req = urllib.request.Request(url, headers={'User-Agent': ua} if ua else {})
    return urllib.request.urlopen(req).read()


def blocks(css):
    """[(style, weight, url, range or None)] in CSS order."""
    out = []
    for b in re.findall(r'@font-face\s*{(.*?)}', css, re.S):
        style = re.search(r'font-style: (\w+);', b).group(1)
        weight = re.search(r'font-weight: ([^;]+);', b).group(1)
        url = re.search(r'url\(([^)]+)\)', b).group(1)
        rng = re.search(r'unicode-range: ([^;]+);', b)
        out.append((style, weight, url, rng.group(1).strip() if rng else None))
    return out


def rule(family, style, weight, src, fmt, rng=None):
    out = f"""@font-face {{
  font-family: '{family}';
  font-style: {style};
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
    src, rng, out = args
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = 'woff2'
    s = subset.Subsetter(opts)
    s.populate(unicodes=parse(rng))
    s.subset(font)
    font.flavor = 'woff2'
    font.save(out)


def folder(name):
    path = os.path.join(ROOT, name)
    os.makedirs(path, exist_ok=True)
    return path


def self_host(css, slug, out):
    """Download every file the CSS points to and rewrite the URLs.

    Files are named after Google's slice label (the [119] or latin comment, or the
    number in the URL) so a Network panel shows which slice each request is.
    """
    names = {}
    for label, style, url in re.findall(
            r'(?:/\* ([^*]+?) \*/\s*)?@font-face\s*{[^}]*?font-style: (\w+);[^}]*?url\(([^)]+)\)', css):
        if url in names:
            continue
        num = re.search(r'\.(\d+)\.woff2$', url)
        tag = (label or (num and num.group(1)) or str(len(names))).strip('[]').replace(' ', '-')
        name = f"{slug}{'-italic' if style == 'italic' else ''}-{tag}.woff2"
        assert name not in names.values(), name
        path = os.path.join(out, name)
        if not os.path.exists(path):
            open(path, 'wb').write(fetch(url))
        names[url] = name
    return re.sub(r'url\(([^)]+)\)', lambda m: f'url({names[m.group(1)]})', css)


if __name__ == '__main__':
    a, b, c, d, dr = (folder(n) for n in
                      ('full-a-ttf', 'full-b-woff2', 'full-c-subset', 'full-d-google', 'full-d-range'))
    css = {k: [] for k in 'abcdr'}
    jobs = []
    for slug, family, listed, ranged in FAMILIES:
        a_blocks = blocks(fetch(API.format(listed)).decode())
        if slug == 'nskr':
            d_css = open(os.path.join(ROOT, 'd-google-variable-4w', 'fonts.css')).read()
        else:
            d_css = fetch(API.format(listed), CHROME_UA).decode()
        d_blocks = blocks(d_css)

        css['d'].append(self_host(d_css, slug, d))
        css['r'].append(self_host(fetch(API.format(ranged), CHROME_UA).decode(), slug, dr))

        for style, weight, url, _ in a_blocks:
            key = f'{slug}-{style}-{weight}'
            ttf = os.path.join(a, f'{key}.ttf')
            if not os.path.exists(ttf):
                open(ttf, 'wb').write(fetch(url))
            css['a'].append(rule(family, style, weight, f'{key}.ttf', 'truetype'))

            woff2 = os.path.join(b, f'{key}.woff2')
            if slug == 'nskr':
                shutil.copy(os.path.join(ROOT, 'b-full-woff2-4w', f'noto-sans-kr-{weight}.woff2'), woff2)
            elif not os.path.exists(woff2):
                font = TTFont(ttf)
                font.flavor = 'woff2'
                font.save(woff2)
            css['b'].append(rule(family, style, weight, f'{key}.woff2', 'woff2'))

            ranges = [r for s, w, _, r in d_blocks if s == style and w == weight]
            assert ranges, (family, style, weight)
            for i, r in enumerate(ranges):
                name = f'{key}-{i}.woff2'
                if slug == 'nskr':
                    shutil.copy(os.path.join(ROOT, 'c-subset-woff2-4w', f'nskr-{weight}-{i}.woff2'),
                                os.path.join(c, name))
                elif not os.path.exists(os.path.join(c, name)):
                    jobs.append((ttf, r, os.path.join(c, name)))
                css['c'].append(rule(family, style, weight, name, 'woff2', r))

    with ProcessPoolExecutor() as ex:
        list(ex.map(cut, jobs))

    for k, out in zip('abcdr', (a, b, c, d, dr)):
        open(os.path.join(out, 'fonts.css'), 'w').write('\n'.join(css[k]) + '\n')
    # Every family is SIL OFL 1.1, each with its own copyright line.
    licenses = {name: fetch(f'https://raw.githubusercontent.com/google/fonts/main/ofl/{repo}/OFL.txt')
                for name, repo in (('OFL-noto-sans-kr.txt', 'notosanskr'), ('OFL-noto-serif-kr.txt', 'notoserifkr'),
                                   ('OFL-inter.txt', 'inter'), ('OFL-jetbrains-mono.txt', 'jetbrainsmono'))}
    for out in (a, b, c, d, dr):
        if os.path.exists(os.path.join(out, 'OFL.txt')):
            os.remove(os.path.join(out, 'OFL.txt'))
        for name, text in licenses.items():
            open(os.path.join(out, name), 'wb').write(text)
    print('cut', len(jobs), 'new slices', file=sys.stderr)
