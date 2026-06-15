from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pathlib import Path

OUT = Path('/Users/umi/.openclaw/workspace/generated/2d-vending-machine-proposal-onepager-landscape.pptx')
IMG = Path('/Users/umi/.openclaw/workspace/generated/2d-vending-machine-qr-removed-receive-online-onsite-v2.png')

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
slide = prs.slides.add_slide(prs.slide_layouts[6])

# colors
TEAL = RGBColor(0, 128, 146)
DARK = RGBColor(0, 77, 92)
NAVY = RGBColor(14, 48, 70)
PALE = RGBColor(232, 247, 250)
BG = RGBColor(244, 250, 252)
TEXT = RGBColor(25, 43, 52)
MUTED = RGBColor(76, 96, 105)
ORANGE = RGBColor(236, 145, 38)
GREEN = RGBColor(28, 150, 95)
CYAN = RGBColor(30, 173, 195)
LINE = RGBColor(170, 216, 224)
WHITE = RGBColor(255,255,255)

# helpers
def add_round(x,y,w,h,fill=WHITE,line=LINE,radius=True,width=1.5):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.fill.solid(); shp.fill.fore_color.rgb = fill
    shp.line.color.rgb = line; shp.line.width = Pt(width)
    return shp

def add_text(x,y,w,h,text,size=16,bold=False,color=TEXT,align=PP_ALIGN.LEFT,margin=0.08):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.clear(); tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.TOP
    tf.margin_left = Inches(margin); tf.margin_right = Inches(margin); tf.margin_top = Inches(0.02); tf.margin_bottom = Inches(0.02)
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run(); r.text = text
    r.font.name = 'Yu Gothic'
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color
    return tb

def pill(x,y,w,h,text,fill=TEAL,size=12):
    add_round(x,y,w,h,fill=fill,line=fill,width=0)
    return add_text(x,y+0.02,w,h-0.02,text,size=size,bold=True,color=WHITE,align=PP_ALIGN.CENTER,margin=0.02)

def bullet(x,y,num,title,desc,color):
    circ = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(0.38), Inches(0.38))
    circ.fill.solid(); circ.fill.fore_color.rgb = color
    circ.line.color.rgb = color
    add_text(x, y+0.035, 0.38, 0.18, num, size=11, bold=True, color=WHITE, align=PP_ALIGN.CENTER, margin=0)
    add_text(x+0.48, y-0.02, 2.8, 0.25, title, size=13, bold=True, color=TEXT)
    add_text(x+0.48, y+0.25, 2.9, 0.42, desc, size=9.5, color=MUTED)

# background
bg = slide.background.fill
bg.solid(); bg.fore_color.rgb = BG
# decorative border lines
for y in [0.18, 0.32, 7.18, 7.32]:
    line = slide.shapes.add_connector(1, Inches(0.3), Inches(y), Inches(13.03), Inches(y))
    line.line.color.rgb = LINE; line.line.width = Pt(1)

# Header
add_round(0.35,0.28,12.63,1.02,fill=WHITE,line=TEAL,width=2.2)
# top band
band = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.35), Inches(0.28), Inches(12.63), Inches(0.28))
band.fill.solid(); band.fill.fore_color.rgb = TEAL; band.line.color.rgb = TEAL
add_text(0.56,0.34,1.2,0.18,'提案資料',size=10.5,bold=True,color=WHITE,margin=0)
add_text(0.58,0.64,5.5,0.46,'2D自販機 導入提案',size=28,bold=True,color=NAVY,margin=0)
add_text(5.55,0.69,6.95,0.36,'NFCタッチ購入 × オンライン受取 / 現地受取対応',size=17,bold=True,color=TEAL,align=PP_ALIGN.RIGHT,margin=0)

# Left: concept + challenges
add_round(0.45,1.52,3.7,2.15,fill=WHITE,line=LINE,width=1.4)
pill(0.65,1.72,1.15,0.32,'CONCEPT',fill=TEAL,size=10)
add_text(0.65,2.10,3.25,0.38,'スマホをタッチして購入',size=18,bold=True,color=DARK,margin=0)
add_text(0.65,2.52,3.25,0.88,'リアルな商品展示を2D化し、各商品にNFCタッチ導線を付与。利用者はスマホを近づけるだけで購入画面へ進めます。',size=11.5,color=TEXT,margin=0)

add_round(0.45,3.88,3.7,2.25,fill=WHITE,line=LINE,width=1.4)
pill(0.65,4.08,1.25,0.32,'POINTS',fill=ORANGE,size=10)
bullet(0.68,4.58,'1','省スペース化','掲示面だけで販売導線を設置可能',CYAN)
bullet(0.68,5.18,'2','QRコード削除','NFCタッチ中心で案内を整理',ORANGE)
bullet(0.68,5.78,'3','受取方法を選択','オンライン受取・現地受取に対応',GREEN)

# Center visual
add_round(4.35,1.52,4.25,4.86,fill=WHITE,line=TEAL,width=1.8)
add_text(4.62,1.72,3.7,0.25,'完成イメージ',size=13,bold=True,color=TEAL,align=PP_ALIGN.CENTER,margin=0)
if IMG.exists():
    slide.shapes.add_picture(str(IMG), Inches(4.82), Inches(2.04), height=Inches(4.02))
add_text(4.55,6.07,3.85,0.16,'右下QRコードを削除し、受取方法案内へ置き換え',size=8.8,color=MUTED,align=PP_ALIGN.CENTER,margin=0)

# Right: flow and benefits
add_round(8.83,1.52,4.05,2.15,fill=WHITE,line=LINE,width=1.4)
pill(9.03,1.72,1.15,0.32,'FLOW',fill=TEAL,size=10)
steps = [('1','商品を選ぶ'),('2','スマホをタッチ'),('3','購入・受取')]
xs=[9.18,10.38,11.58]
for i,(n,t) in enumerate(steps):
    x=xs[i]
    circ=slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(2.22), Inches(0.62), Inches(0.62))
    circ.fill.solid(); circ.fill.fore_color.rgb = [CYAN, ORANGE, GREEN][i]
    circ.line.color.rgb = [CYAN, ORANGE, GREEN][i]
    add_text(x,2.34,0.62,0.2,n,size=14,bold=True,color=WHITE,align=PP_ALIGN.CENTER,margin=0)
    add_text(x-0.22,2.95,1.05,0.36,t,size=10.5,bold=True,color=TEXT,align=PP_ALIGN.CENTER,margin=0)
    if i<2:
        conn=slide.shapes.add_connector(1, Inches(x+0.72), Inches(2.53), Inches(xs[i+1]-0.1), Inches(2.53))
        conn.line.color.rgb = LINE; conn.line.width = Pt(2)
add_text(9.1,3.30,3.55,0.2,'決済後、オンライン受取または現地受取を選択',size=9.8,color=MUTED,align=PP_ALIGN.CENTER,margin=0)

add_round(8.83,3.88,4.05,2.25,fill=WHITE,line=LINE,width=1.4)
pill(9.03,4.08,1.28,0.32,'MERITS',fill=GREEN,size=10)
benefits=[('販売機会を増やす','イベント・店舗・展示会など限られたスペースでも展開'),('運用負荷を下げる','NFC中心の導線で、購入までの迷いを削減'),('受取体験を選べる','オンライン受取と現地受取の両方に対応')]
y=4.55
for i,(title,desc) in enumerate(benefits):
    add_round(9.08,y,0.32,0.32,fill=[CYAN,ORANGE,GREEN][i],line=[CYAN,ORANGE,GREEN][i],width=0)
    add_text(9.55,y-0.02,2.95,0.24,title,size=12.5,bold=True,color=TEXT,margin=0)
    add_text(9.55,y+0.25,2.95,0.30,desc,size=9.3,color=MUTED,margin=0)
    y += 0.58

# bottom summary bar
add_round(0.45,6.55,12.43,0.48,fill=TEAL,line=TEAL,width=0)
add_text(0.72,6.68,11.85,0.18,'提案ポイント：QRコードに頼らず、NFCタッチ購入と「オンライン / 現地受取」の選択肢を一枚で伝える2D自販機',size=12.5,bold=True,color=WHITE,align=PP_ALIGN.CENTER,margin=0)

# Set all text fit/vertical center where needed? Keep simple.
prs.save(OUT)
print(OUT)
print('slides', len(prs.slides))
