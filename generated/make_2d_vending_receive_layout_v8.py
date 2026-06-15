from PIL import Image, ImageDraw, ImageFont
import os

SRC = '/Users/umi/.openclaw/workspace/generated/2d-vending-machine-receive-options-v7-a4.png'
OUT = '/Users/umi/.openclaw/workspace/generated/2d-vending-machine-receive-options-v9-a4.png'

FONT_MED = '/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7/11ead4dd9f3a3503b4ced2546782dd8bc31871c9.asset/AssetData/YuGothic-Medium.otf'
FONT_BOLD = '/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7/0703ece025f7511095fc290b30bc2d3d28d509a9.asset/AssetData/YuGothic-Bold.otf'

def F(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_MED, size)

def fit(draw, xy, text, max_w, size, fill, bold=False, min_size=13, anchor=None):
    s = size
    while s >= min_size:
        ft = F(s, bold)
        box = draw.textbbox((0, 0), text, font=ft)
        if box[2] - box[0] <= max_w:
            draw.text(xy, text, font=ft, fill=fill, anchor=anchor)
            return s
        s -= 1
    draw.text(xy, text, font=F(min_size, bold), fill=fill, anchor=anchor)
    return min_size

def center_text(draw, box, text, size, fill, bold=False):
    ft = F(size, bold)
    bb = draw.textbbox((0, 0), text, font=ft)
    x = (box[0] + box[2] - (bb[2]-bb[0])) / 2
    y = (box[1] + box[3] - (bb[3]-bb[1])) / 2 - 2
    draw.text((x, y), text, font=ft, fill=fill)

def shadow_round(base, rect, radius=28, alpha=32, offset=7):
    sh = Image.new('RGBA', base.size, (0,0,0,0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle((rect[0]+offset, rect[1]+offset, rect[2]+offset, rect[3]+offset), radius=radius, fill=(0,0,0,alpha))
    return Image.alpha_composite(base.convert('RGBA'), sh).convert('RGB')

im = Image.open(SRC).convert('RGB')
d = ImageDraw.Draw(im)
W, H = im.size

# 下部案内を全面的に再構成。自販機下枠は残し、フッターまで統合して間延びを消す。
y0, y1 = 1062, 1720
d.rectangle((0, y0, W, y1), fill=(244, 249, 253))
# 背景にごく薄いラインを入れて空白感を減らす
for y in range(y0+18, y1, 34):
    d.line((62, y, W-62, y), fill=(236, 244, 250), width=1)

outer = (64, y0+18, W-64, y1-24)
im = shadow_round(im, outer, radius=30, alpha=38, offset=8)
d = ImageDraw.Draw(im)
d.rounded_rectangle(outer, radius=30, fill=(255,255,255), outline=(19,91,172), width=5)

# Header: 重複ラベルを排除し、階層を明確に
hdr = (outer[0]+24, outer[1]+22, outer[2]-24, outer[1]+92)
d.rounded_rectangle(hdr, radius=20, fill=(19,91,172))
fit(d, (hdr[0]+28, hdr[1]+15), 'タッチで購入、受取方法をその場で選択', hdr[2]-hdr[0]-330, 31, 'white', True)
fit(d, (hdr[2]-286, hdr[1]+18), 'NFC / QR 対応', 250, 23, (219,242,255), True)
fit(d, (hdr[0]+30, hdr[1]+48), 'オンライン決済後、現地受取または配送を選べます', hdr[2]-hdr[0]-60, 18, (225,241,255), False)

content_top = hdr[3] + 20
content_bottom = outer[3] - 112
left = (outer[0]+24, content_top, outer[0]+438, content_bottom)
right = (left[2]+24, content_top, outer[2]-24, content_bottom)

# 左: 余白をカードで埋め、情報量と見た目の密度を上げる
accent = (238, 126, 33)
d.rounded_rectangle(left, radius=22, fill=(255,248,236), outline=(238,166,65), width=3)
fit(d, (left[0]+26, left[1]+22), 'この場所限定', left[2]-left[0]-52, 34, (190,76,24), True)
fit(d, (left[0]+26, left[1]+66), '事前購入でスムーズに受け取り', left[2]-left[0]-52, 21, (62,63,68), True)

# 2つの強調チップ
chip_y = left[1] + 104
chips = [((left[0]+24, chip_y, left[0]+190, chip_y+78), '在庫', '確保'),
         ((left[0]+206, chip_y, left[2]-24, chip_y+78), '待ち時間', '短縮')]
for rect, a, b in chips:
    d.rounded_rectangle(rect, radius=18, fill=(255,255,255), outline=(238,166,65), width=3)
    center_text(d, (rect[0], rect[1]+8, rect[2], rect[1]+40), a, 24, accent, True)
    center_text(d, (rect[0], rect[1]+39, rect[2], rect[3]-4), b, 26, (35,48,66), True)

benefits = [
    ('01', '現地受取', '注文番号を見せてすぐ受取'),
    ('02', '配送受取', '持ち帰り不要で自宅へお届け'),
    ('03', '窓口購入', 'スマホ操作が不安でも相談可'),
]
by = chip_y + 98
for no, title, desc in benefits:
    row = (left[0]+24, by, left[2]-24, by+62)
    d.rounded_rectangle(row, radius=16, fill=(255,255,255), outline=(246,205,139), width=2)
    d.ellipse((row[0]+16, row[1]+13, row[0]+52, row[1]+49), fill=accent)
    center_text(d, (row[0]+16, row[1]+12, row[0]+52, row[1]+50), no, 15, 'white', True)
    d.text((row[0]+66, row[1]+9), title, font=F(22, True), fill=(35,48,66))
    fit(d, (row[0]+66, row[1]+36), desc, row[2]-row[0]-84, 16, (86,91,99), False)
    by += 72

# 右: ステップを大きく整理し、重複説明を統合
blue = (19,91,172)
d.rounded_rectangle(right, radius=22, fill=(242,249,255), outline=(181,215,240), width=3)
fit(d, (right[0]+28, right[1]+22), 'カンタン3ステップ', right[2]-right[0]-56, 32, blue, True)
fit(d, (right[0]+28, right[1]+62), 'スマホを近づけるだけで購入画面へ進めます', right[2]-right[0]-56, 18, (82,94,108), False)

steps = [
    ('1', 'スマホをタッチ', 'NFCで商品ページを表示', (0,154,189)),
    ('2', 'オンライン購入', 'その場で決済・在庫確保', (238,126,33)),
    ('3', '受取方法を選ぶ', '現地受取／配送を選択', (36,145,83)),
]
sy = right[1] + 104
for no, title, desc, color in steps:
    row = (right[0]+28, sy, right[2]-28, sy+74)
    d.rounded_rectangle(row, radius=18, fill=(255,255,255), outline=(203,224,239), width=2)
    d.ellipse((row[0]+20, row[1]+13, row[0]+70, row[1]+63), fill=color)
    center_text(d, (row[0]+20, row[1]+11, row[0]+70, row[1]+64), no, 27, 'white', True)
    d.text((row[0]+88, row[1]+13), title, font=F(25, True), fill=(28,42,60))
    fit(d, (row[0]+88, row[1]+44), desc, row[2]-row[0]-110, 18, (76,88,102), False)
    sy += 86

# 受取方法カード: 注記を本文から分離して見栄えを上げる
method_y = sy + 4
method_title = (right[0]+28, method_y, right[2]-28, method_y+36)
d.rounded_rectangle(method_title, radius=14, fill=(226,244,255), outline=(130,195,231), width=2)
center_text(d, method_title, '選べる受取方法', 20, blue, True)

my = method_y + 48
method_gap = 14
mw = (right[2]-right[0]-56 - method_gap*2) // 3
methods = [('現地受取', '注文番号提示'), ('配送受取', '自宅へお届け'), ('相談窓口', '操作サポート')]
for i, (title, sub) in enumerate(methods):
    x = right[0]+28 + i*(mw+method_gap)
    rect = (x, my, x+mw, my+66)
    d.rounded_rectangle(rect, radius=16, fill=(255,255,255), outline=(154,205,235), width=2)
    center_text(d, (rect[0], rect[1]+8, rect[2], rect[1]+36), title, 19, (28,42,60), True)
    center_text(d, (rect[0], rect[1]+36, rect[2], rect[3]-4), sub, 14, (85,95,105), False)

# 下端フロー: 孤立したフッターをビジュアル要素に昇格。注記は削って、遠目の可読性を優先。
flow = (outer[0]+24, outer[3]-88, outer[2]-24, outer[3]-20)
d.rounded_rectangle(flow, radius=22, fill=(235,247,255), outline=(19,91,172), width=3)
flow_items = [('タッチ', 0.18), ('購入', 0.50), ('受取', 0.82)]
for idx, (label, pos) in enumerate(flow_items):
    cx = int(flow[0] + (flow[2]-flow[0])*pos)
    cy = (flow[1]+flow[3])//2
    if idx < 2:
        nx = int(flow[0] + (flow[2]-flow[0])*flow_items[idx+1][1])
        d.line((cx+68, cy, nx-68, cy), fill=(94,167,215), width=6)
        d.polygon([(nx-82, cy-11), (nx-60, cy), (nx-82, cy+11)], fill=(94,167,215))
    d.ellipse((cx-56, cy-28, cx+56, cy+28), fill=(19,91,172))
    center_text(d, (cx-56, cy-30, cx+56, cy+28), label, 23, 'white', True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT, quality=96)
print(OUT)
