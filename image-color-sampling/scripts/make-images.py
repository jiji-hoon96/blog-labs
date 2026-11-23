# 카드 썸네일 24장을 만든다. 토스뱅크 피드 카드와 같은 3200x2160 PNG 이고,
# 색 읽기용 작은 썸네일(64x43)과 미리 계산한 색(colors.json)을 함께 만든다.
#   python3 scripts/make-images.py
import json, os, random
from PIL import Image, ImageDraw, ImageFilter

W, H, N = 3200, 2160, 24
out = os.path.join(os.path.dirname(__file__), '..', 'images')
random.seed(7)
colors = {}
for i in range(N):
    hue = (i * 37) % 360
    bg = tuple(int(v) for v in Image.new('HSV', (1, 1), (int(hue / 360 * 255), 70, 245)).convert('RGB').getpixel((0, 0)))
    img = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(img)
    for _ in range(40):  # 그림 대신 겹친 도형. 압축이 잘 안 되게 잡음을 섞는다
        x, y, r = random.randint(400, 2800), random.randint(200, 1960), random.randint(80, 520)
        c = tuple(min(255, max(0, v + random.randint(-90, 90))) for v in bg)
        d.ellipse((x - r, y - r, x + r, y + r), fill=c)
    img = img.filter(ImageFilter.GaussianBlur(3))
    noise = Image.effect_noise((W, H), 6).convert('RGB')
    img = Image.blend(img, noise, 0.005)
    name = f'card-{i:02d}'
    img.save(os.path.join(out, f'{name}.png'))
    img.resize((64, 43), Image.LANCZOS).save(os.path.join(out, f'{name}-thumb.png'))
    r, g, b = img.getpixel((W - 20, 20))
    colors[name] = {'r': r, 'g': g, 'b': b}
json.dump(colors, open(os.path.join(out, 'colors.json'), 'w'), indent=1)
print('done', N)
