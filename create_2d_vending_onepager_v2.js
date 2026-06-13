const pptxgen = require('pptxgenjs');
const pptx = new pptxgen();
pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE';
pptx.author = 'Shiro-mini';
pptx.company = 'OpenClaw';
pptx.subject = '2D自販機 提案書 v2';
pptx.title = '2D自販機 提案書';
pptx.lang = 'ja-JP';
pptx.theme = { headFontFace: 'Hiragino Kaku Gothic ProN', bodyFontFace: 'Hiragino Sans', lang: 'ja-JP' };
pptx.margin = 0;

const s = pptx.addSlide();
const C = {
  bg1:'071B33', bg2:'0B2B4A', panel:'0F3B5F', card:'FFFFFF', soft:'EAF8FF',
  cyan:'12D6F3', blue:'1E88E5', navy:'08223A', yellow:'FFD166', orange:'FF9F1C',
  green:'20C997', purple:'7C5CFF', text:'0B2035', gray:'5E7385', line:'BFEAF7', white:'FFFFFF'
};
function shape(type, o){ s.addShape(type,o); }
function text(t,x,y,w,h,o={}){ s.addText(t,{x,y,w,h,margin:o.margin??0.04,fontFace:o.fontFace??'Hiragino Sans',fontSize:o.fontSize??12,bold:o.bold??false,color:o.color??C.text,fit:o.fit??'shrink',breakLine:o.breakLine,align:o.align??'left',valign:o.valign??'top',paraSpaceAfterPt:0,paraSpaceBeforePt:0,...o}); }
function rr(x,y,w,h,fill,line='FFFFFF',r=0.16,trans=0){ shape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:r,fill:{color:fill,transparency:trans},line:{color:line,width:1}}); }
function pill(t,x,y,w,h,fill,color=C.white,fs=8.5){ rr(x,y,w,h,fill,fill,0.14); text(t,x,y+0.015,w,h,{fontSize:fs,bold:true,color,align:'center',valign:'mid',margin:0.01}); }
function glowCircle(x,y,w,h,color,trans){ shape(pptx.ShapeType.ellipse,{x,y,w,h,fill:{color,transparency:trans},line:{color,transparency:100}}); }
function iconDot(x,y,color,label){ shape(pptx.ShapeType.ellipse,{x,y,w:0.34,h:0.34,fill:{color},line:{color,width:0}}); text(label,x,y+0.045,0.34,0.18,{fontSize:8.5,bold:true,color:C.white,align:'center',margin:0}); }

// Background
shape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:7.5,fill:{color:C.bg1},line:{color:C.bg1,width:0}});
glowCircle(8.9,-1.5,5.2,5.2,C.cyan,86); glowCircle(-1.2,4.8,4.2,4.2,C.blue,88); glowCircle(10.5,5.3,3.5,3.5,C.purple,90);
shape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:7.5,fill:{color:'FFFFFF',transparency:100},line:{color:'FFFFFF',transparency:100}});

// Header
pill('ONE PAGE PROPOSAL',0.55,0.38,1.48,0.28,C.cyan,C.navy,8);
text('2D自販機',0.55,0.72,2.9,0.55,{fontSize:33,bold:true,color:C.white,margin:0});
text('ポスターが、そのまま自販機になる。',3.05,0.86,4.1,0.28,{fontSize:15,bold:true,color:C.yellow,margin:0});
text('現地体験を “その場で買える購買導線” に変える、NFC / QR 対応の平面型販売ツール',0.58,1.29,6.4,0.25,{fontSize:10.5,color:'BCEEFF',margin:0});
pill('NFC TOUCH',10.34,0.47,0.98,0.28,C.cyan,C.navy,8);
pill('QR ORDER',11.44,0.47,0.88,0.28,C.green,C.white,8);
pill('PICKUP / DELIVERY',10.52,0.85,1.65,0.28,C.yellow,C.navy,8);

// Main left hero surface
rr(0.58,1.72,5.25,4.75,'EAF8FF','77DFF0',0.22);
shape(pptx.ShapeType.rect,{x:0.82,y:1.96,w:4.78,h:0.55,fill:{color:C.navy},line:{color:C.navy,width:0}});
text('2D VENDING BOARD',1.02,2.12,1.85,0.16,{fontSize:10,bold:true,color:C.white,margin:0});
pill('タッチして購入',4.18,2.08,1.05,0.24,C.yellow,C.navy,8);

// Product grid
const colors=[C.cyan,C.green,C.yellow,C.orange,C.blue,C.purple];
const names=['限定A','限定B','限定C','会場限定','推し活','観光'];
let startX=1.04,startY=2.76,w=1.25,h=0.92,gx=0.30,gy=0.34;
for(let i=0;i<6;i++){
  let col=i%3,row=Math.floor(i/3),x=startX+col*(w+gx),y=startY+row*(h+gy);
  rr(x,y,w,h,'FFFFFF','A6E9F5',0.10);
  shape(pptx.ShapeType.rect,{x:x+0.10,y:y+0.10,w:w-0.20,h:0.42,fill:{color:colors[i],transparency:i===2?12:0},line:{color:colors[i],width:0}});
  text(names[i],x+0.12,y+0.58,w-0.24,0.14,{fontSize:8.6,bold:true,color:C.navy,align:'center',margin:0});
  text('商品枠',x+0.12,y+0.74,w-0.24,0.11,{fontSize:6.6,color:C.gray,align:'center',margin:0});
}

// NFC / QR base
rr(1.05,5.46,2.00,0.58,C.navy,C.navy,0.12);
text('NFC',1.22,5.60,0.38,0.16,{fontSize:10,bold:true,color:C.cyan,margin:0});
text('スマホをかざす',1.78,5.61,0.86,0.14,{fontSize:7.7,bold:true,color:C.white,margin:0});
for(let i=0;i<3;i++) shape(pptx.ShapeType.arc,{x:1.58+i*0.13,y:5.52-i*0.04,w:0.36+i*0.08,h:0.32+i*0.08,line:{color:C.cyan,width:1.2},fill:{color:C.navy,transparency:100}});
rr(3.78,5.34,0.72,0.72,C.white,C.navy,0.02);
for(let r=0;r<5;r++)for(let c=0;c<5;c++)if((r+c*2)%3===0||(r<2&&c<2)||(r>2&&c>2))shape(pptx.ShapeType.rect,{x:3.86+c*0.11,y:5.42+r*0.11,w:0.07,h:0.07,fill:{color:C.navy},line:{color:C.navy,width:0}});
text('QR',4.61,5.57,0.28,0.15,{fontSize:9,bold:true,color:C.navy,margin:0});
// phone
rr(5.00,4.82,0.52,1.04,'16233A','16233A',0.11);
rr(5.06,4.95,0.40,0.75,'DFF9FF','DFF9FF',0.04);
shape(pptx.ShapeType.line,{x:4.82,y:5.20,w:-0.60,h:-0.18,line:{color:C.orange,width:2.4,endArrowType:'triangle'}});
text('スマホ決済へ',4.10,4.80,0.72,0.16,{fontSize:7.8,bold:true,color:C.orange,margin:0});

// Right content white panel
rr(6.12,1.72,6.62,4.75,'FFFFFF','FFFFFF',0.22);
text('提案概要',6.48,2.02,0.92,0.20,{fontSize:12,bold:true,color:C.blue,margin:0});
text('ポスター・パネル・POP上の商品枠から、スマホのNFCタッチまたはQR読み取りで購入。物理自販機を置かずに、イベント会場・店舗・観光地・ライブ会場へ「その場で買える売り場」を展開できます。',6.48,2.34,5.55,0.55,{fontSize:11.2,color:C.text,margin:0.01,fit:'shrink'});

// Three value cards
const cards=[
 ['現地受取','注文番号 / QR提示でスムーズ受取。事前購入で在庫確保し、ファストパス的に受け取れる。',C.green,'01'],
 ['オンライン配送','現地で見て購入し、後日配送。荷物を増やしたくない来場者にも対応。',C.orange,'02'],
 ['相談窓口','スマホ操作が難しいユーザー向けに、窓口購入導線も用意可能。',C.blue,'03']
];
for(let i=0;i<3;i++){
  const x=6.48+i*1.94;
  rr(x,3.16,1.74,1.28,'F7FCFF','D5F0F8',0.13);
  iconDot(x+0.16,3.35,cards[i][2],cards[i][3]);
  text(cards[i][0],x+0.54,3.35,1.08,0.16,{fontSize:9.2,bold:true,color:C.navy,margin:0});
  text(cards[i][1],x+0.16,3.76,1.42,0.42,{fontSize:7.6,color:C.gray,margin:0.01,fit:'shrink'});
}

// Benefits split
rr(6.48,4.70,2.78,1.20,'FFF8E8','FFE6A3',0.12);
text('ユーザーのメリット',6.68,4.88,1.15,0.16,{fontSize:9.5,bold:true,color:C.navy,margin:0});
text('• 現地限定感\n• スマホだけで簡単購入\n• 在庫確保 / 待ち時間削減\n• 現地受取・配送を選べる',6.68,5.14,2.12,0.46,{fontSize:7.9,color:C.text,margin:0.01,fit:'shrink'});
rr(9.48,4.70,2.78,1.20,'EFFFF9','B8F2DD',0.12);
text('事業者のメリット',9.68,4.88,1.15,0.16,{fontSize:9.5,bold:true,color:C.navy,margin:0});
text('• 大型機器不要\n• 商品差し替えが容易\n• 限定販売に強い\n• 在庫 / 受取 / 配送を管理',9.68,5.14,2.12,0.46,{fontSize:7.9,color:C.text,margin:0.01,fit:'shrink'});

// Bottom flow band
rr(0.58,6.72,12.16,0.48,'FFFFFF','FFFFFF',0.18);
text('FLOW',0.86,6.88,0.46,0.12,{fontSize:8.5,bold:true,color:C.blue,margin:0});
const flow=[['見る','商品枠を選ぶ'],['触れる','NFC / QR'],['買う','決済・受取選択'],['受け取る','現地受取 / 配送']];
let fx=1.65;
flow.forEach((f,i)=>{
  iconDot(fx,6.79,[C.cyan,C.blue,C.orange,C.green][i],String(i+1));
  text(f[0],fx+0.44,6.80,0.48,0.12,{fontSize:8.5,bold:true,color:C.navy,margin:0});
  text(f[1],fx+0.94,6.80,1.18,0.12,{fontSize:7.4,color:C.gray,margin:0});
  if(i<3) shape(pptx.ShapeType.line,{x:fx+2.28,y:6.96,w:0.42,h:0,line:{color:'A4DBEA',width:1.4,endArrowType:'triangle'}});
  fx+=2.85;
});
text('活用：アイドル/アーティストグッズ・トレカ・イベント限定商品・観光地限定商品・ポップアップ・展示会・ライブ会場',0.60,7.28,8.2,0.10,{fontSize:6.8,color:'B9DDEA',margin:0});

s.addNotes('説明トーク例: 2D自販機は、ポスターやパネルをそのまま販売導線に変える仕組みです。ユーザーは現地で商品を見つけ、スマホでタッチまたはQR読み取りして購入。受取は現地受取とオンライン配送の両方に対応し、事前購入による在庫確保や注文番号/QR提示によるスムーズな受取が可能です。物理自販機を置かずに展開できるため、イベント・店舗・観光地・ライブ会場などの限定販売や混雑緩和に向いています。');

pptx.writeFile({ fileName:'/Users/umi/.openclaw/workspace/2d-vending-machine-onepager-v2.pptx' });
