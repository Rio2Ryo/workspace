const pptxgen = require('pptxgenjs');
const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Shiro';
pptx.subject = 'EC構築プラン 見積書 構成案';
pptx.title = 'EC構築・運用プラン 見積書';
pptx.company = '';
pptx.lang = 'ja-JP';
pptx.theme = {
  headFontFace: 'Yu Gothic',
  bodyFontFace: 'Yu Gothic',
  lang: 'ja-JP'
};

// A4 landscape: 297 x 210 mm = 11.69 x 8.27 in
pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
pptx.layout = 'A4_LANDSCAPE';
pptx.margin = 0;
pptx.defineSlideMaster({
  title: 'MASTER',
  background: { color: 'F7F8FA' },
  objects: []
});

const slide = pptx.addSlide('MASTER');
slide.background = { color: 'F7F8FA' };

const C = {
  navy: '16233A',
  blue: '2563EB',
  lightBlue: 'EAF1FF',
  green: '0F766E',
  lightGreen: 'EAF7F4',
  orange: 'C2410C',
  lightOrange: 'FFF3E8',
  gray: '5B6472',
  line: 'D8DEE8',
  white: 'FFFFFF',
  black: '111827',
  red: 'B91C1C'
};

function text(slide, str, x, y, w, h, opt={}) {
  slide.addText(str, {
    x, y, w, h,
    fontFace: 'Yu Gothic',
    color: opt.color || C.black,
    fontSize: opt.fontSize || 11,
    bold: opt.bold || false,
    valign: opt.valign || 'top',
    align: opt.align || 'left',
    fit: 'shrink',
    breakLine: false,
    margin: opt.margin ?? 0.04,
    paraSpaceAfterPt: opt.paraSpaceAfterPt ?? 0,
    bullet: opt.bullet,
    lineSpacingMultiple: opt.lineSpacingMultiple,
  });
}

function rect(slide, x, y, w, h, fill, line=C.line, radius=0.12) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: radius,
    fill: { color: fill },
    line: { color: line, width: 1 }
  });
}

// Header
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 11.69, h: 0.82, fill: { color: C.navy }, line: { color: C.navy } });
text(slide, 'EC構築・運用プラン 見積書（構成案）', 0.35, 0.18, 7.6, 0.35, { color: 'FFFFFF', fontSize: 21, bold: true });
text(slide, 'A4横 / PowerPoint編集可能テキストベース', 8.05, 0.25, 3.2, 0.24, { color: 'DCE6F8', fontSize: 9.5, align: 'right' });
text(slide, '目的：初期費用と成果報酬率の組み合わせによる3プラン比較', 0.38, 0.95, 10.8, 0.28, { color: C.gray, fontSize: 10.5 });

// Plan cards
const plans = [
  {name:'プラン1', initial:'10万円', success:'10%', color:C.blue, light:C.lightBlue, note:'初期費用を抑え、成果報酬で調整するプラン'},
  {name:'プラン2', initial:'50万円', success:'5%', color:C.green, light:C.lightGreen, note:'初期費用と成果報酬のバランス型プラン'},
  {name:'プラン3', initial:'100万円', success:'0%', color:C.orange, light:C.lightOrange, note:'成果報酬なしで導入する買い切り寄りプラン'},
];
const cardY=1.38, cardW=3.47, cardH=2.78, gap=0.22;
plans.forEach((p,i)=>{
  const x=0.38+i*(cardW+gap);
  rect(slide, x, cardY, cardW, cardH, C.white, C.line, 0.15);
  slide.addShape(pptx.ShapeType.roundRect, { x:x+0.12, y:cardY+0.12, w:0.88, h:0.32, rectRadius:0.08, fill:{color:p.light}, line:{color:p.light} });
  text(slide, p.name, x+0.18, cardY+0.18, 0.78, 0.18, { color:p.color, fontSize:10.5, bold:true, align:'center' });
  text(slide, p.note, x+1.1, cardY+0.14, 2.18, 0.34, { color:C.gray, fontSize:8.8 });
  text(slide, '初期費用', x+0.18, cardY+0.72, 0.9, 0.18, { color:C.gray, fontSize:9 });
  text(slide, p.initial, x+0.18, cardY+0.96, 1.35, 0.38, { color:C.black, fontSize:22, bold:true });
  text(slide, '成果報酬', x+1.86, cardY+0.72, 0.9, 0.18, { color:C.gray, fontSize:9 });
  text(slide, p.success, x+1.86, cardY+0.96, 1.05, 0.38, { color:p.color, fontSize:22, bold:true });
  slide.addShape(pptx.ShapeType.line, { x:x+0.18, y:cardY+1.55, w:cardW-0.36, h:0, line:{color:C.line, width:1} });
  text(slide, '標準内容', x+0.18, cardY+1.74, 0.8, 0.2, { color:C.black, fontSize:10, bold:true });
  text(slide, '• 基本的なEC機能\n• ロジ連携\n• 動画掲載が可能\n• ミニマム構成で導入', x+0.22, cardY+2.02, 2.85, 0.62, { color:C.black, fontSize:9.2, lineSpacingMultiple:0.85 });
});

// Common terms
rect(slide, 0.38, 4.42, 5.25, 2.55, C.white, C.line, 0.12);
text(slide, '共通仕様・費用条件', 0.58, 4.60, 2.4, 0.25, { color:C.navy, fontSize:13.5, bold:true });
text(slide, 'オプション機能', 0.58, 4.98, 1.3, 0.18, { color:C.black, fontSize:10.5, bold:true });
text(slide, '追加機能を希望する場合は、プラスオンで要見積もり。', 1.75, 4.98, 3.45, 0.2, { color:C.black, fontSize:9.5 });
text(slide, '運用・資産', 0.58, 5.34, 1.3, 0.18, { color:C.black, fontSize:10.5, bold:true });
text(slide, '• 基本的に資産はこちら側が保有し、運用もこちらで行います。\n• 資産を利用し続ける限り、成果報酬が発生します。\n• 成果報酬の金額を調整することで、機能追加等の個別対応も可能です。', 1.75, 5.30, 3.55, 0.72, { color:C.black, fontSize:8.8, lineSpacingMultiple:0.84 });
text(slide, '月額運用費', 0.58, 6.23, 1.3, 0.18, { color:C.black, fontSize:10.5, bold:true });
text(slide, '案A：1万円＋実費（Shopify利用料等）　/　案B：一律3万円', 1.75, 6.22, 3.65, 0.25, { color:C.red, fontSize:9.2, bold:true });

// Customization / notes
rect(slide, 5.82, 4.42, 5.48, 2.55, C.white, C.line, 0.12);
text(slide, 'カスタマイズ・保証条件', 6.02, 4.60, 2.5, 0.25, { color:C.navy, fontSize:13.5, bold:true });
text(slide, 'ソースコード開示', 6.02, 5.02, 1.45, 0.2, { color:C.black, fontSize:10.5, bold:true });
text(slide, 'お客様自身でのカスタマイズも可能です。', 7.48, 5.02, 3.45, 0.2, { color:C.black, fontSize:9.5 });
text(slide, '保証対象外', 6.02, 5.45, 1.45, 0.2, { color:C.black, fontSize:10.5, bold:true });
text(slide, '自己カスタマイズによりバグが発生した場合は、運用保証の対象外となります。', 7.48, 5.44, 3.4, 0.35, { color:C.black, fontSize:9.2 });
text(slide, '備考', 6.02, 6.08, 1.45, 0.2, { color:C.black, fontSize:10.5, bold:true });
text(slide, '本資料はローデータです。正式提出時は、社名・見積有効期限・支払い条件・成果報酬の対象売上定義などを追記してください。', 7.48, 6.04, 3.45, 0.55, { color:C.gray, fontSize:8.8 });

// Footer
slide.addShape(pptx.ShapeType.line, { x:0.38, y:7.35, w:10.92, h:0, line:{color:C.line, width:1} });
text(slide, '※ 金額は税別想定。成果報酬の算定対象・締め日・支払期日は別途契約書または発注書で定義。', 0.42, 7.48, 10.2, 0.28, { color:C.gray, fontSize:8.5 });
text(slide, 'Draft', 10.66, 7.48, 0.55, 0.2, { color:C.gray, fontSize:8.5, align:'right' });

pptx.writeFile({ fileName: '/Users/umi/.openclaw/workspace/ec_plan_estimate_draft_A4_landscape.pptx' });
