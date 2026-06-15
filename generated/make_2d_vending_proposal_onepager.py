from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import os, textwrap

OUT = Path('/Users/umi/.openclaw/workspace/generated/2d-vending-machine-proposal-onepager.png')
VISUAL = Path('/Users/umi/.openclaw/workspace/generated/2d-vending-machine-qr-removed-receive-online-onsite-v2.png')
OUT.parent.mkdir(parents=True, exist_ok=True)

W,H = 1240,1754
im = Image.new('RGB',(W,H),(244,250,252))
d = ImageDraw.Draw(im)

B='/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7/0703ece025f7511095fc290b30bc2d3d28d509a9.asset/AssetData/YuGothic-Bold.otf'
M='/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7/11ead4dd9f3a3503b4ced2546782dd8bc31871c9.asset/AssetData/YuGothic-Medium.otf'
if not os.path.exists(B): B='/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
if not os.path.exists(M): M='/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'
def F(s,b=False): return ImageFont.truetype(B if b else M,s)

teal=(0,128,146); teal2=(0,95,112); cyan=(30,173,195); navy=(14,48,70)
text=(25,43,52); muted=(76,96,105); orange=(236,145,38); green=(28,150,95)
white=(255,255,255); pale=(232,247,250); line=(170,216,224)

# background decorative lines
for y in [34,50,1688,1706]:
    d.line((50,y,W-50,y), fill=(185,222,228), width=2)
for x in [34,W-34]:
    d.line((x,70,x,H-70), fill=(198,228,232), width=2)

# Header
header=(70,60,W-70,250)
d.rounded_rectangle(header, radius=30, fill=white, outline=teal, width=5)
d.rectangle((70,60,W-70,120), fill=teal)
d.rounded_rectangle(header, radius=30, outline=teal, width=5)
d.text((105,82),'提案資料',font=F(25,True),fill='white')
d.text((105,135),'2D自販機 導入提案',font=F(54,True),fill=navy)
d.text((106,202),'スマホをタッチするだけで購入。オンライン受取・現地受取に対応。',font=F(24),fill=muted)

# Main visual card right
visual_card=(700,295,1155,1135)
d.rounded_rectangle(visual_card, radius=26, fill=white, outline=line, width=3)
if VISUAL.exists():
    v=Image.open(VISUAL).convert('RGB')
    # crop bottom/right? keep whole flyer scaled
    scale=min((visual_card[2]-visual_card[0]-36)/v.width,(visual_card[3]-visual_card[1]-36)/v.height)
    nw,nh=int(v.width*scale),int(v.height*scale)
    v=v.resize((nw,nh),Image.LANCZOS)
    x=visual_card[0]+(visual_card[2]-visual_card[0]-nw)//2
    y=visual_card[1]+18
    im.paste(v,(x,y))

# left concept
box1=(70,295,660,545)
d.rounded_rectangle(box1,radius=24,fill=white,outline=line,width=3)
d.text((105,325),'企画コンセプト',font=F(34,True),fill=teal2)
concept='リアルな商品展示を2D化し、各商品にNFCタッチ導線を付与。利用者はスマホを近づけるだけで購入画面へ進み、決済後にオンライン受取または現地受取を選べます。'
Y=382
for line_txt in textwrap.wrap(concept, width=24):
    d.text((105,Y),line_txt,font=F(23),fill=text)
    Y+=36

# challenges/solution
box2=(70,575,660,830)
d.rounded_rectangle(box2,radius=24,fill=white,outline=line,width=3)
d.text((105,600),'解決できる課題',font=F(32,True),fill=teal2)
items=[('省スペース化','実機在庫を置かず、掲示面だけで販売導線を作れる'),('購入体験の簡略化','NFCタッチで商品ページへ直接遷移し、迷わず購入'),('受取方法の柔軟化','オンライン受取・現地受取の両方に対応')]
Y=650
for title,desc in items:
    d.ellipse((105,Y+4,125,Y+24),fill=orange)
    d.text((140,Y),title,font=F(24,True),fill=text)
    d.text((140,Y+34),desc,font=F(19),fill=muted)
    Y+=62

# operation flow
box3=(70,860,660,1135)
d.rounded_rectangle(box3,radius=24,fill=white,outline=line,width=3)
d.text((105,890),'利用フロー',font=F(32,True),fill=teal2)
steps=[('1','商品を選ぶ','2D自販機上のカード/商品を確認'),('2','スマホをタッチ','NFCから購入ページへアクセス'),('3','購入・受取','オンライン/現地受取を選択')]
Y=950
for no,title,desc in steps:
    d.ellipse((105,Y,157,Y+52),fill=teal)
    # center no
    bb=d.textbbox((0,0),no,font=F(28,True)); d.text((105+(52-(bb[2]-bb[0]))/2,Y+(52-(bb[3]-bb[1]))/2-3),no,font=F(28,True),fill='white')
    d.text((178,Y-2),title,font=F(25,True),fill=text)
    d.text((178,Y+31),desc,font=F(19),fill=muted)
    Y+=62

# bottom value proposition full width
bottom=(70,1180,1155,1600)
d.rounded_rectangle(bottom,radius=30,fill=white,outline=teal,width=4)
d.text((105,1215),'導入メリット',font=F(36,True),fill=teal2)
cols=[
    ('販売機会を増やす','イベント・店舗・展示会など、限られたスペースでも商品購入導線を設置可能。'),
    ('運用負荷を下げる','QRコード依存を減らし、NFCタッチ中心の直感的な購買体験に。'),
    ('受取体験を選べる','オンライン受取に加えて、イベント会場や店舗での現地受取にも対応。')
]
col_w=330
for i,(title,desc) in enumerate(cols):
    x=105+i*350
    card=(x,1280,x+320,1505)
    d.rounded_rectangle(card,radius=22,fill=(242,250,251),outline=line,width=2)
    colors=[cyan,orange,green]
    d.rounded_rectangle((x+22,1305,x+74,1357),radius=15,fill=colors[i])
    icon=['01','02','03'][i]
    bb=d.textbbox((0,0),icon,font=F(20,True)); d.text((x+22+(52-(bb[2]-bb[0]))/2,1305+(52-(bb[3]-bb[1]))/2-2),icon,font=F(20,True),fill='white')
    d.text((x+22,1380),title,font=F(25,True),fill=text)
    yy=1420
    for line_txt in textwrap.wrap(desc,width=15):
        d.text((x+22,yy),line_txt,font=F(18),fill=muted)
        yy+=28

# footer note
footer=(70,1630,1155,1690)
d.rounded_rectangle(footer,radius=20,fill=teal,outline=teal,width=2)
d.text((105,1646),'提案ポイント：右下QRコードは削除し、NFCタッチ導線＋オンライン/現地受取の案内に整理',font=F(22,True),fill='white')

im.save(OUT,quality=96)
print(OUT)
