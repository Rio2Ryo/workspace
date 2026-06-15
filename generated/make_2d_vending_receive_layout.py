from PIL import Image, ImageDraw, ImageFont
import os

BASE = '/Users/umi/.openclaw/workspace/tmp/codex_img/base.png'
OUT = '/Users/umi/.openclaw/workspace/generated/2d-vending-machine-receive-options-v4.png'

# 微調整用パラメータ
CLEAN_Y0 = 1032      # 商品/B段/自販機下枠に被らない開始位置
CLEAN_Y1 = 1428      # 既存フッターを残す終了位置
PANEL_PAD_X = 42
PANEL_PAD_Y = 14
COL_GAP = 22
HEADER_H = 48

FONT_MED = '/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7/11ead4dd9f3a3503b4ced2546782dd8bc31871c9.asset/AssetData/YuGothic-Medium.otf'
FONT_BOLD = '/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7/0703ece025f7511095fc290b30bc2d3d28d509a9.asset/AssetData/YuGothic-Bold.otf'

def F(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_MED, size)

def draw_fit(draw, xy, text, max_w, size, fill, bold=False, min_size=12):
    s = size
    while s >= min_size:
        ft = F(s, bold)
        box = draw.textbbox((0, 0), text, font=ft)
        if box[2] - box[0] <= max_w:
            draw.text(xy, text, font=ft, fill=fill)
            return s
        s -= 1
    draw.text(xy, text, font=F(min_size, bold), fill=fill)
    return min_size

im = Image.open(BASE).convert('RGB')
d = ImageDraw.Draw(im)
W, H = im.size

# 下部案内エリアだけを差し替え。上部商品とフッターは触らない。
d.rectangle((0, CLEAN_Y0, W, CLEAN_Y1), fill=(248, 252, 255))

outer = (PANEL_PAD_X, CLEAN_Y0 + PANEL_PAD_Y, W - PANEL_PAD_X, CLEAN_Y1 - PANEL_PAD_Y)
# 影は内側に収める
shadow = Image.new('RGBA', im.size, (0,0,0,0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle((outer[0]+5, outer[1]+5, outer[2]+5, outer[3]+5), radius=26, fill=(0,0,0,42))
im = Image.alpha_composite(im.convert('RGBA'), shadow).convert('RGB')
d = ImageDraw.Draw(im)

d.rounded_rectangle(outer, radius=26, fill=(255,255,255), outline=(24,96,178), width=4)

# Header
hx0, hy0, hx1, hy1 = outer[0]+18, outer[1]+14, outer[2]-18, outer[1]+14+HEADER_H
d.rounded_rectangle((hx0, hy0, hx1, hy1), radius=18, fill=(24,96,178))
draw_fit(d, (hx0+22, hy0+10), 'タッチして購入 → 受取方法を選択', hx1-hx0-220, 26, 'white', True)
draw_fit(d, (hx1-142, hy0+14), '2D自販機', 120, 19, (220,242,255), True)

content_top = hy1 + 16
content_bottom = outer[3] - 14
left_w = 330
left = (outer[0]+18, content_top, outer[0]+18+left_w, content_bottom)
right = (left[2]+COL_GAP, content_top, outer[2]-18, content_bottom)

# Left promo card
d.rounded_rectangle(left, radius=20, fill=(255,247,229), outline=(245,166,35), width=3)
draw_fit(d, (left[0]+20, left[1]+18), 'この場所限定', left[2]-left[0]-40, 30, (205,86,20), True)
draw_fit(d, (left[0]+20, left[1]+64), '事前購入なら', left[2]-left[0]-40, 25, (45,50,60), True)

pill = (left[0]+18, left[1]+104, left[2]-18, left[1]+188)
d.rounded_rectangle(pill, radius=16, fill=(255,255,255), outline=(245,166,35), width=3)
draw_fit(d, (pill[0]+20, pill[1]+13), '在庫確保', pill[2]-pill[0]-40, 28, (30,45,65), True)
draw_fit(d, (pill[0]+20, pill[1]+48), 'スムーズ受取', pill[2]-pill[0]-40, 27, (30,45,65), True)

bullet_y = left[1] + 212
for t in ['現地受取を選べる', '配送受取も選べる', '相談窓口でも購入可']:
    draw_fit(d, (left[0]+24, bullet_y), '・' + t, left[2]-left[0]-48, 20, (65,72,82), False)
    bullet_y += 30

# Right steps card
d.rounded_rectangle(right, radius=20, fill=(244,250,255), outline=(190,218,242), width=3)
draw_fit(d, (right[0]+24, right[1]+16), 'カンタン3ステップ', right[2]-right[0]-48, 27, (24,96,178), True)

steps = [
    ('1', 'スマホをタッチ', 'NFCで商品ページへ', (0,161,196)),
    ('2', 'オンライン購入', 'その場でかんたん決済', (249,138,33)),
    ('3', '受取方法を選択', '現地受取／オンライン配送', (34,150,83)),
]
y = right[1] + 58
for no, title, desc, color in steps:
    row = (right[0]+18, y, right[2]-18, y+48)
    d.rounded_rectangle(row, radius=14, fill=(255,255,255), outline=(207,226,241), width=2)
    d.ellipse((row[0]+12, row[1]+9, row[0]+42, row[1]+39), fill=color)
    d.text((row[0]+22, row[1]+9), no, font=F(18, True), fill='white')
    d.text((row[0]+56, row[1]+8), title, font=F(20, True), fill=(25,40,60))
    draw_fit(d, (row[0]+250, row[1]+12), desc, row[2]-(row[0]+262), 17, (68,83,98), False)
    y += 56

info = (right[0]+18, y+6, right[2]-18, right[3]-16)
d.rounded_rectangle(info, radius=16, fill=(230,247,255), outline=(24,96,178), width=3)
draw_fit(d, (info[0]+18, info[1]+14), '受取は現地受取／オンライン配送を選択', info[2]-info[0]-36, 21, (15,70,140), True)
draw_fit(d, (info[0]+18, info[1]+47), '注文番号提示でスムーズ受取', info[2]-info[0]-36, 22, (25,45,65), True)
draw_fit(d, (info[0]+18, info[1]+79), '※ タッチ購入が難しい方は相談窓口でも購入可', info[2]-info[0]-36, 15, (90,90,90), False)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT, quality=96)
print(OUT)
