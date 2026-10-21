"""Splits the Latin Noto Sans case into format and subset effects.

Same question as the Korean pages, asked of the Latin font the legacy CSS
pinned (Noto Sans v27, 400). Prints three transfer sizes for one weight:
the gzip'd TTF as gstatic sends it, the same TTF as woff2 without
subsetting, and Fontsource's latin subset.

    python3 scripts/split-latin.py
"""
import io
import urllib.request

from fontTools.ttLib import TTFont

TTF = 'https://fonts.gstatic.com/s/notosans/v27/o-0IIpQlx3QUlC5A4PNb4g.ttf'
SUBSET = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.2.7/files/noto-sans-latin-400-normal.woff2'


def fetch(url, gzip=False):
    req = urllib.request.Request(url, headers={'Accept-Encoding': 'gzip'} if gzip else {})
    with urllib.request.urlopen(req) as res:
        return res.read()


ttf_gzip = len(fetch(TTF, gzip=True))
font = TTFont(io.BytesIO(fetch(TTF)))
font.flavor = 'woff2'
buf = io.BytesIO()
font.save(buf)
full_woff2 = buf.tell()
subset = len(fetch(SUBSET))

print(f'TTF, gzip transfer   {ttf_gzip:>9,} B')
print(f'woff2, no subset     {full_woff2:>9,} B')
print(f'woff2, latin subset  {subset:>9,} B')
total = ttf_gzip - subset
print(f'format share {(ttf_gzip - full_woff2) / total:.0%}, subset share {(full_woff2 - subset) / total:.0%}')
