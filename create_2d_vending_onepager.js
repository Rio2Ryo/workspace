const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
pptx.author = 'Shiro-mini / Claude';
pptx.subject = '2D自販機 一枚提案書';
pptx.title = '2D自販機 提案書';
pptx.company = 'OpenClaw';
pptx.lang = 'ja-JP';
pptx.theme = {
  headFontFace: 'Hiragino Sans',
  bodyFontFace: 'Hiragino Sans',
  lang: 'ja-JP'
};
pptx.defineLayout({ name: 'CUSTOM_WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'CUSTOM_WIDE';
pptx.margin = 0;
pptx.defineSlideMaster({
  title: 'MASTER',
  background: { color: 'F5FBFF' },
  objects: [
    { line: { x: 0, y: 7.28, w: 13.333, h: 0, line: { color: '00A7C8', transparency: 40, width: 1 } } }
  ],
  slideNumber: { x: 12.35, y: 7.22, color: '8AA2B2' }
});

const slide = pptx.addSlide('MASTER');
slide.background = { color: 'F5FBFF' };

const C = {
  navy: '083B5B',
  blue: '0077B6',
  cyan: '00B4D8',
  light: 'E8F8FF',
  pale: 'F8FDFF',
  yellow: 'FFD166',
  orange: 'FF9F1C',
  green: '18A999',
  gray: '5D7280',
  dark: '1A2E3A',
  white: 'FFFFFF',
  line: 'B7E5F3',
};

function txt(text, x, y, w, h, opt = {}) {
  slide.addText(text, {
    x, y, w, h,
    margin: opt.margin ?? 0.04,
    fontFace: opt.fontFace ?? 'Hiragino Sans',
    fontSize: opt.fontSize ?? 11,
    bold: opt.bold ?? false,
    color: opt.color ?? C.dark,
    breakLine: opt.breakLine,
    fit: opt.fit ?? 'shrink',
    valign: opt.valign ?? 'top',
    align: opt.align ?? 'left',
    paraSpaceAfterPt: opt.paraSpaceAfterPt ?? 0,
    paraSpaceBeforePt: 0,
    ...opt
  });
}
function roundRect(x,y,w,h,fill=C.white,line=C.line,r=0.15,trans=0){
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:r,fill:{color:fill,transparency:trans},line:{color:line,width:1}});
}
function pill(text, x,y,w,h, fill, color=C.white){
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:0.18,fill:{color:fill},line:{color:fill,width:0}});
  txt(text,x,y+0.015,w,h,{fontSize:8.5,bold:true,color,align:'center',valign:'mid',margin:0.02});
}
function card(title, body, x, y, w, h, accent=C.cyan){
  roundRect(x,y,w,h,C.white,C.line,0.12);
  slide.addShape(pptx.ShapeType.rect,{x,y,w:0.07,h,fill:{color:accent},line:{color:accent,width:0}});
  txt(title,x+0.16,y+0.10,w-0.26,0.20,{fontSize:10.5,bold:true,color:C.navy,margin:0});
  txt(body,x+0.16,y+0.36,w-0.25,h-0.40,{fontSize:7.6,color:C.gray,margin:0.01,fit:'shrink',breakLine:false});
}
function iconCircle(label, x,y, color){
  slide.addShape(pptx.ShapeType.ellipse,{x,y,w:0.45,h:0.45,fill:{color},line:{color,width:0}});
  txt(label,x,y+0.04,0.45,0.26,{fontSize:11,bold:true,color:C.white,align:'center',valign:'mid',margin:0});
}

// Header
slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:0.78,fill:{color:C.navy},line:{color:C.navy,width:0}});
slide.addShape(pptx.ShapeType.rect,{x:0,y:0.78,w:13.333,h:0.06,fill:{color:C.cyan},line:{color:C.cyan,width:0}});
txt('2D自販機 提案書',0.45,0.13,3.1,0.34,{fontSize:22,bold:true,color:C.white,margin:0});
txt('ポスターが、そのまま自販機になる。',3.35,0.20,3.9,0.28,{fontSize:13,bold:true,color:C.yellow,margin:0});
pill('NFC / QR',10.45,0.19,0.9,0.28,C.cyan);
pill('現地受取',11.45,0.19,0.82,0.28,C.green);
pill('配送対応',12.36,0.19,0.75,0.28,C.orange);
txt('現地体験を、その場で買える購買導線へ',0.47,0.52,4.6,0.20,{fontSize:8.8,color:'BEEFFF',margin:0});

// Left vending mock
roundRect(0.45,1.03,4.15,5.55,'DDF5FF','90DFF4',0.22);
slide.addShape(pptx.ShapeType.roundRect,{x:0.67,y:1.25,w:3.7,h:4.75,rectRadius:0.18,fill:{color:'FFFFFF'},line:{color:'78CFE8',width:1.5}});
txt('2D VENDING BOARD',0.88,1.38,2.0,0.2,{fontSize:9,bold:true,color:C.blue,margin:0});
pill('スマホでタッチして購入',2.88,1.31,1.22,0.28,C.yellow,C.navy);

const products = [
  ['限定A','トレカ'],['限定B','グッズ'],['限定C','コラボ'],
  ['限定D','会場'],['限定E','推し活'],['限定F','観光']
];
let px=0.9, py=1.78, pw=0.98, ph=1.02, gapx=0.28, gapy=0.33;
for(let i=0;i<6;i++){
  let col=i%3,row=Math.floor(i/3);
  let x=px+col*(pw+gapx), y=py+row*(ph+gapy);
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w:pw,h:ph,rectRadius:0.10,fill:{color:i%2?'F7FCFF':'ECFAFF'},line:{color:'A8E7F5',width:1}});
  slide.addShape(pptx.ShapeType.ellipse,{x:x+0.28,y:y+0.13,w:0.42,h:0.42,fill:{color:['00B4D8','18A999','FFD166','FF9F1C','0077B6','9B5DE5'][i]},line:{color:'FFFFFF',width:1}});
  txt(products[i][0],x+0.08,y+0.58,pw-0.16,0.16,{fontSize:8,bold:true,color:C.navy,align:'center',margin:0});
  txt(products[i][1],x+0.08,y+0.75,pw-0.16,0.15,{fontSize:6.8,color:C.gray,align:'center',margin:0});
}

slide.addShape(pptx.ShapeType.roundRect,{x:0.93,y:4.65,w:1.52,h:0.54,rectRadius:0.10,fill:{color:C.navy},line:{color:C.navy,width:0}});
txt('NFC\nTOUCH',1.02,4.72,0.54,0.32,{fontSize:7.3,bold:true,color:C.white,align:'center',margin:0});
slide.addShape(pptx.ShapeType.arc,{x:1.58,y:4.75,w:0.30,h:0.20,adjustPoint:0.3,line:{color:C.cyan,width:1.2},fill:{transparency:100}});
slide.addShape(pptx.ShapeType.arc,{x:1.70,y:4.70,w:0.42,h:0.30,adjustPoint:0.3,line:{color:C.cyan,width:1.2},fill:{transparency:100}});
txt('タッチ',2.02,4.78,0.32,0.14,{fontSize:7,bold:true,color:C.yellow,align:'center',margin:0});

slide.addShape(pptx.ShapeType.rect,{x:2.85,y:4.64,w:0.68,h:0.68,fill:{color:C.white},line:{color:C.navy,width:1}});
// fake QR
for (let r=0;r<5;r++) for (let c=0;c<5;c++) if ((r*c+r+c)%2===0 || (r<2&&c<2) || (r>2&&c>2)) {
  slide.addShape(pptx.ShapeType.rect,{x:2.91+c*0.11,y:4.70+r*0.11,w:0.07,h:0.07,fill:{color:C.navy},line:{color:C.navy,width:0}});
}
txt('QR読取',3.6,4.82,0.45,0.15,{fontSize:7,bold:true,color:C.navy,margin:0});

slide.addShape(pptx.ShapeType.roundRect,{x:3.18,y:5.12,w:0.55,h:0.92,rectRadius:0.10,fill:{color:'1C2833'},line:{color:'1C2833',width:0}});
slide.addShape(pptx.ShapeType.roundRect,{x:3.25,y:5.22,w:0.41,h:0.66,rectRadius:0.04,fill:{color:'E9FBFF'},line:{color:'E9FBFF',width:0}});
slide.addShape(pptx.ShapeType.line,{x:3.05,y:5.24,w:-0.72,h:-0.16,line:{color:C.orange,width:2,beginArrowType:'none',endArrowType:'triangle'}});
txt('商品枠に\nスマホをかざす',0.92,5.42,1.55,0.34,{fontSize:8.2,bold:true,color:C.navy,align:'center',margin:0.02});

// Center concept + cards
roundRect(4.82,1.03,3.3,1.28,C.white,C.line,0.14);
txt('概要',5.02,1.17,0.55,0.18,{fontSize:10.5,bold:true,color:C.blue,margin:0});
txt('ポスター・パネル・POP上の商品枠から、スマホのNFCタッチ / QR読み取りで購入。大型機器なしで、イベント・店舗・観光地・ライブ会場に「その場で買える売り場」を作れます。',5.02,1.43,2.86,0.58,{fontSize:8.4,color:C.dark,margin:0.01,fit:'shrink'});

card('ユーザー価値','現地限定感 / 簡単購入 / 在庫確保 / 配送選択 / 待ち時間削減',4.82,2.56,1.55,1.15,C.cyan);
card('事業者価値','大型機器不要 / 商品差替え容易 / 限定販売に強い / 在庫・受取・配送を管理',6.57,2.56,1.55,1.15,C.green);

roundRect(4.82,3.98,3.3,1.78,C.white,C.line,0.14);
txt('受取方法',5.02,4.13,0.82,0.18,{fontSize:10.5,bold:true,color:C.blue,margin:0});
iconCircle('1',5.03,4.48,C.green); txt('現地受取',5.55,4.43,0.85,0.16,{fontSize:8.6,bold:true,color:C.navy,margin:0}); txt('注文番号/QR提示。事前購入で在庫確保、受取所でスムーズ受取。',5.55,4.62,2.25,0.30,{fontSize:7.2,color:C.gray,margin:0,fit:'shrink'});
iconCircle('2',5.03,5.05,C.orange); txt('オンライン配送',5.55,5.00,1.00,0.16,{fontSize:8.6,bold:true,color:C.navy,margin:0}); txt('現地で見て購入し、荷物を増やさず後日配送で受取。',5.55,5.19,2.15,0.22,{fontSize:7.2,color:C.gray,margin:0,fit:'shrink'});
iconCircle('3',6.72,5.05,C.blue); txt('相談窓口',7.22,5.00,0.75,0.16,{fontSize:8.6,bold:true,color:C.navy,margin:0}); txt('スマホ操作が難しい方の購入導線も用意。',7.22,5.19,0.72,0.36,{fontSize:6.6,color:C.gray,margin:0,fit:'shrink'});

// Right big use cases / ops
roundRect(8.40,1.03,4.48,4.73,C.white,C.line,0.14);
txt('活用シーン',8.65,1.20,1.05,0.18,{fontSize:10.8,bold:true,color:C.blue,margin:0});
const usecases = ['アイドル / アーティストグッズ','トレーディングカード','イベント限定商品','観光地限定商品','ポップアップストア','コラボカフェ・展示会','ライブ会場'];
let ux=8.65, uy=1.58;
usecases.forEach((u,i)=>{
  const x = ux + (i%2)*2.05, y = uy + Math.floor(i/2)*0.42;
  pill(u,x,y, i===6?2.0:1.82,0.24, i%3===0?C.cyan:i%3===1?C.green:C.orange, i%3===2?C.navy:C.white);
});

slide.addShape(pptx.ShapeType.roundRect,{x:8.65,y:3.55,w:3.95,h:1.55,rectRadius:0.12,fill:{color:'F1FBFF'},line:{color:'D3F2FA',width:1}});
txt('導入イメージ',8.84,3.70,0.95,0.17,{fontSize:9.8,bold:true,color:C.navy,margin:0});
txt('商品画像とリンク先を差し替えるだけで、会場別・店舗別・キャンペーン別の「ミニ売り場」をすばやく展開。受取/配送/在庫のオペレーションはオンライン側で管理できます。',8.84,4.00,3.45,0.54,{fontSize:8,color:C.gray,margin:0.01,fit:'shrink'});
slide.addShape(pptx.ShapeType.line,{x:8.95,y:4.84,w:3.05,h:0,line:{color:C.cyan,width:2,beginArrowType:'none',endArrowType:'triangle'}});
txt('掲示物設置',8.70,4.92,0.80,0.14,{fontSize:6.8,bold:true,color:C.blue,align:'center',margin:0});
txt('購入導線化',10.02,4.92,0.80,0.14,{fontSize:6.8,bold:true,color:C.blue,align:'center',margin:0});
txt('受取/配送',11.35,4.92,0.72,0.14,{fontSize:6.8,bold:true,color:C.blue,align:'center',margin:0});

// Flow bottom
roundRect(0.45,6.10,12.43,0.92,'FFFFFF','B7E5F3',0.12);
txt('購入フロー',0.68,6.23,0.75,0.17,{fontSize:10.5,bold:true,color:C.blue,margin:0});
const flow = [ ['01','商品を選ぶ'], ['02','NFCタッチ / QR'], ['03','決済・受取選択'], ['04','現地受取 or 配送'] ];
let fx=1.75;
flow.forEach((f,i)=>{
  iconCircle(f[0],fx,6.31, [C.cyan,C.blue,C.orange,C.green][i]);
  txt(f[1],fx+0.55,6.35,1.35,0.16,{fontSize:8.8,bold:true,color:C.navy,margin:0});
  if(i<3) slide.addShape(pptx.ShapeType.line,{x:fx+1.72,y:6.53,w:0.72,h:0,line:{color:'92DFF2',width:1.6,endArrowType:'triangle'}});
  fx += 2.55;
});

txt('一言でいうと：現地のポスターを「販売・決済・受取」までつながるインタラクティブな売り場に変える仕組み。',0.58,7.12,8.4,0.16,{fontSize:7.5,color:C.gray,margin:0});
txt('2D Vending Machine / One-page proposal',10.15,7.12,2.55,0.16,{fontSize:7.2,color:'8AA2B2',align:'right',margin:0});

slide.addNotes(`説明トーク例:\nこの2D自販機は、ポスターやパネルをそのまま販売導線に変える仕組みです。ユーザーは現地で商品を見つけ、スマホでタッチまたはQR読み取りして購入できます。受取は現地受取とオンライン配送の両方に対応し、事前購入による在庫確保や注文番号/QR提示によるスムーズな受取が可能です。物理自販機を置かずに展開できるため、イベント・店舗・観光地・ライブ会場などの限定販売や混雑緩和に向いています。`);

pptx.writeFile({ fileName: '/Users/umi/.openclaw/workspace/2d-vending-machine-onepager.pptx' });
