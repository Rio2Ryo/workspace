from PIL import Image, ImageDraw, ImageFont
import os

SRC = '/Users/umi/.openclaw/workspace/generated/2d-vending-machine-receive-options-v7-a4.png'
OUT = '/Users/umi/.openclaw/workspace/generated/2d-vending-machine-receive-options-v11-a4.png'

FONT_MED = '/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7/11ead4dd9f3a3503b4ced2546782dd8bc31871c9.asset/AssetData/YuGothic-Medium.otf'
FONT_BOLD = '/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7/0703ece025f7511095fc290b30bc2d3d28d509a9.asset/AssetData/YuGothic-Bold.otf'

def F(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_MED, size)

def fit(draw, xy, text, max_w, size, fill, bold=False, min_size=12, anchor=None):
    s = size
    while s >= min_size:
        ft = F(s, bold)
        bb = draw.textbbox((0, 0), text, font=ft)
        if bb[2] - bb[0] <= max_w:
            draw.text(xy, text, font=ft, fill=fill, anchor=anchor)
            return s
        s -= 1
    draw.text(xy, text, font=F(min_size, bold), fill=fill, anchor=anchor)
    return min_size

def center(draw, rect, text, size, fill, bold=False):
    ft = F(size, bold)
    bb = draw.textbbox((0,0), text, font=ft)
    x = (rect[0]+rect[2]-(bb[2]-bb[0]))/2
    y = (rect[1]+rect[3]-(bb[3]-bb[1]))/2 - 2
    draw.text((x,y), text, font=ft, fill=fill)

def add_shadow(im, rect, r=28, offset=7, alpha=34):
    layer = Image.new('RGBA', im.size, (0,0,0,0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((rect[0]+offset, rect[1]+offset, rect[2]+offset, rect[3]+offset), radius=r, fill=(0,0,0,alpha))
    return Image.alpha_composite(im.convert('RGBA'), layer).convert('RGB')

im = Image.open(SRC).convert('RGB')
d = ImageDraw.Draw(im)
W,H = im.size

# 1) 赤丸指定箇所: 自販機下部の横長バーを丸ごと削除
# 商品エリア下の不要なレール/ラベルを背景で自然に消す
bar_cover = (34, 970, W-34, 1042)
d.rounded_rectangle(bar_cover, radius=18, fill=(245, 249, 252))
# 自販機外枠の左右だけ少し残して、切り抜き感を減らす
d.line((34, 970, 34, 1028), fill=(162, 188, 203), width=2)
d.line((W-34, 970, W-34, 1028), fill=(162, 188, 203), width=2)

# 2) 下部説明エリアを全面再設計。内容は維持し、カード感と余白を整理。
y0, y1 = 1062, 1720
d.rectangle((0, y0, W, y1), fill=(245, 249, 252))
# 上の区切り線もすっきりさせる
d.rounded_rectangle((100, y0+10, W-100, y0+18), radius=4, fill=(199, 221, 235))

outer = (64, y0+42, W-64, y1-26)
im = add_shadow(im, outer, r=32, offset=8, alpha=36)
d = ImageDraw.Draw(im)
d.rounded_rectangle(outer, radius=32, fill=(255,255,255), outline=(18,88,166), width=5)

blue = (18,88,166)
light_blue = (232,246,255)
text = (30,45,62)
muted = (83,97,112)
orange = (234,126,36)
green = (36,145,86)
cyan = (0,151,185)

# Header: 右側の「NFC / QR 対応」バッジを削除し、中央タイトル化
hdr = (outer[0]+28, outer[1]+24, outer[2]-28, outer[1]+104)
d.rounded_rectangle(hdr, radius=22, fill=blue)
center(d, (hdr[0], hdr[1]+8, hdr[2], hdr[1]+48), 'タッチして購入、受取方法を選択', 33, 'white', True)
center(d, (hdr[0], hdr[1]+48, hdr[2], hdr[3]-4), 'オンライン決済後、現地受取または配送を選べます', 19, (224,241,255), False)

# Main cards
main_top = hdr[3] + 24
main_bottom = outer[3] - 122
left = (outer[0]+30, main_top, outer[0]+488, main_bottom)
right = (left[2]+28, main_top, outer[2]-30, main_bottom)

# 左: 受取方法を3カードで上品に整理
for rect, fillc, outline in [
    (left, (255,250,242), (239,178,91)),
    (right, (243,250,255), (179,215,240)),
]:
    d.rounded_rectangle(rect, radius=24, fill=fillc, outline=outline, width=3)

fit(d, (left[0]+28, left[1]+24), '選べる受取方法', left[2]-left[0]-56, 30, (172,74,23), True)
fit(d, (left[0]+28, left[1]+62), '事前購入で在庫を確保。受け取りもスムーズ。', left[2]-left[0]-56, 17, muted, False)

methods = [
    ('01', '現地受取', '注文番号を提示してすぐ受取', orange),
    ('02', '配送受取', '持ち帰り不要で自宅へ配送', blue),
    ('03', '相談窓口', '操作が不安な方も購入可能', green),
]
my = left[1]+104
for no, title, desc, color in methods:
    card = (left[0]+28, my, left[2]-28, my+78)
    d.rounded_rectangle(card, radius=18, fill=(255,255,255), outline=(235,220,196), width=2)
    badge = (card[0]+18, card[1]+18, card[0]+62, card[1]+62)
    d.ellipse(badge, fill=color)
    center(d, badge, no, 16, 'white', True)
    d.text((card[0]+80, card[1]+14), title, font=F(24, True), fill=text)
    fit(d, (card[0]+80, card[1]+45), desc, card[2]-card[0]-104, 16, muted, False)
    my += 88

# 左下に小さな強調帯。余白潰しではなく締め要素として使う
mini = (left[0]+28, left[3]-74, left[2]-28, left[3]-24)
d.rounded_rectangle(mini, radius=16, fill=(255,255,255), outline=(239,178,91), width=2)
center(d, mini, '在庫確保  ＋  待ち時間短縮', 22, (172,74,23), True)

# 右: 流れを1本の縦タイムラインにしてデザイン品質を上げる
fit(d, (right[0]+30, right[1]+24), 'カンタン3ステップ', right[2]-right[0]-60, 30, blue, True)
fit(d, (right[0]+30, right[1]+62), 'スマホを近づけるだけで購入画面へ進めます', right[2]-right[0]-60, 17, muted, False)

steps = [
    ('1', 'スマホをタッチ', 'NFCで商品ページを表示', cyan),
    ('2', 'オンライン購入', 'その場で決済・在庫確保', orange),
    ('3', '受取方法を選ぶ', '現地受取／配送を選択', green),
]
line_x = right[0]+72
sy = right[1]+110
# timeline line
d.line((line_x, sy+38, line_x, sy+246), fill=(154,205,235), width=6)
for i, (no, title, desc, color) in enumerate(steps):
    cy = sy + i*94
    circ = (line_x-28, cy+8, line_x+28, cy+64)
    d.ellipse(circ, fill=color)
    center(d, circ, no, 26, 'white', True)
    card = (right[0]+122, cy, right[2]-30, cy+74)
    d.rounded_rectangle(card, radius=18, fill=(255,255,255), outline=(200,224,240), width=2)
    d.text((card[0]+24, card[1]+12), title, font=F(25, True), fill=text)
    fit(d, (card[0]+24, card[1]+44), desc, card[2]-card[0]-48, 17, muted, False)

# 右下補足を1つに統合
note = (right[0]+30, right[3]-72, right[2]-30, right[3]-24)
d.rounded_rectangle(note, radius=16, fill=light_blue, outline=(126,195,231), width=2)
center(d, note, '購入後に「現地受取」または「配送」を選択', 20, blue, True)

# Bottom flow: シンプルで大きく、下部の品質を締める
flow = (outer[0]+30, outer[3]-94, outer[2]-30, outer[3]-26)
d.rounded_rectangle(flow, radius=22, fill=(235,247,255), outline=blue, width=3)
items = [('タッチ', cyan), ('購入', blue), ('受取', green)]
centers = [flow[0]+210, (flow[0]+flow[2])//2, flow[2]-210]
cy = (flow[1]+flow[3])//2
for i, (label, color) in enumerate(items):
    cx = centers[i]
    if i < 2:
        nx = centers[i+1]
        d.line((cx+72, cy, nx-72, cy), fill=(112,178,219), width=6)
        d.polygon([(nx-88, cy-12), (nx-62, cy), (nx-88, cy+12)], fill=(112,178,219))
    pill = (cx-64, cy-27, cx+64, cy+27)
    d.rounded_rectangle(pill, radius=27, fill=color)
    center(d, pill, label, 24, 'white', True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT, quality=96)
print(OUT)
