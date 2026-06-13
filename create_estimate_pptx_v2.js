const pptxgen = require('pptxgenjs');
const pptx = new pptxgen();
pptx.author = 'Shiro';
pptx.subject = 'EC構築プラン 見積書 構成案 修正版';
pptx.title = 'EC構築・運用プラン 見積書';
pptx.company = '';
pptx.lang = 'ja-JP';
pptx.theme = { headFontFace: 'Yu Gothic', bodyFontFace: 'Yu Gothic', lang: 'ja-JP' };
pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
pptx.layout = 'A4_LANDSCAPE';
pptx.margin = 0;

const slide = pptx.addSlide();
slide.background = { color: 'F7F8FA' };

const C = {
  navy: '16233A', blue: '2563EB', lightBlue: 'EAF1FF', green: '0F766E', lightGreen: 'EAF7F4',
  orange: 'C2410C', lightOrange: 'FFF3E8', gray: '5B6472', line: 'D8DEE8', white: 'FFFFFF', black: '111827', red: 'B91C1C'
};
function text(str, x, y, w, h, opt={}) {
  slide.addText(str, { x, y, w, h, fontFace:'Yu Gothic', color: opt.color || C.black, fontSize: opt.fontSize || 11,
    bold: opt.bold || false, valign: opt.valign || 'top', align: opt.align || 'left', fit:'shrink', margin: opt.margin ?? 0.04,
    paraSpaceAfterPt: 0, breakLine:false, lineSpacingMultiple: opt.lineSpacingMultiple });
}
function rect(x,y,w,h,fill,line=C.line,radius=0.12){
  slide.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:radius,fill:{color:fill},line:{color:line,width:1}});
}
function line(x,y,w){ slide.addShape(pptx.ShapeType.line,{x,y,w,h:0,line:{color:C.line,width:1}}); }

// Header
slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:11.69, h:0.84, fill:{color:C.navy}, line:{color:C.navy} });
text('EC構築・運用プラン 見積書', 0.36, 0.18, 6.3, 0.38, { color:'FFFFFF', fontSize:22, bold:true });
text('ミニマムで開始するための初期構築プラン', 6.95, 0.25, 4.35, 0.24, { color:'DCE6F8', fontSize:10.5, align:'right' });

// Lead
rect(0.38, 1.04, 10.92, 0.62, C.white, C.line, 0.12);
text('本見積もりは、まずは基本的なEC機能・ロジ連携・動画掲載を備えたミニマム構成で開始するためのものです。コース内容はご要望に応じてカスタマイズ可能です。',
  0.62, 1.20, 10.4, 0.25, { color:C.black, fontSize:10.5 });

// Plan cards
const plans = [
  {name:'プランA', initial:'10万円', success:'10%', color:C.blue, light:C.lightBlue},
  {name:'プランB', initial:'50万円', success:'5%', color:C.green, light:C.lightGreen},
  {name:'プランC', initial:'100万円', success:'0%', color:C.orange, light:C.lightOrange},
];
const cardY=1.92, cardW=3.47, cardH=1.88, gap=0.22;
plans.forEach((p,i)=>{
  const x=0.38+i*(cardW+gap);
  rect(x, cardY, cardW, cardH, C.white, C.line, 0.15);
  slide.addShape(pptx.ShapeType.roundRect, { x:x+0.16, y:cardY+0.16, w:0.9, h:0.34, rectRadius:0.08, fill:{color:p.light}, line:{color:p.light} });
  text(p.name, x+0.22, cardY+0.22, 0.78, 0.18, { color:p.color, fontSize:11, bold:true, align:'center' });
  text('初期費用', x+0.22, cardY+0.78, 0.9, 0.18, { color:C.gray, fontSize:9.5 });
  text(p.initial, x+0.22, cardY+1.02, 1.35, 0.42, { color:C.black, fontSize:24, bold:true });
  text('成果報酬', x+1.92, cardY+0.78, 0.9, 0.18, { color:C.gray, fontSize:9.5 });
  text(p.success, x+1.92, cardY+1.02, 1.05, 0.42, { color:p.color, fontSize:24, bold:true });
});

// Common production content
rect(0.38, 4.10, 5.33, 2.72, C.white, C.line, 0.12);
text('制作内容（全プラン共通）', 0.60, 4.30, 2.5, 0.28, { color:C.navy, fontSize:14, bold:true });
text('以下の内容を備えた、EC販売開始に必要なミニマム構成を制作します。', 0.60, 4.68, 4.75, 0.24, { color:C.gray, fontSize:9.5 });
text('• 基本的なEC機能（商品掲載・購入導線・決済導線）\n• ロジ連携に必要な基本設定・連携導線\n• 商品やブランド訴求のための動画掲載エリア\n• 運用開始後に改善しやすいテキスト/構成ベースの設計\n• 必要最低限の導入・公開前確認',
  0.70, 5.08, 4.72, 1.25, { color:C.black, fontSize:10.2, lineSpacingMultiple:0.9 });

// Operation terms
rect(5.98, 4.10, 5.32, 2.72, C.white, C.line, 0.12);
text('運用・追加対応の考え方', 6.20, 4.30, 2.6, 0.28, { color:C.navy, fontSize:14, bold:true });
text('月額運用費', 6.20, 4.78, 1.1, 0.20, { color:C.black, fontSize:10.5, bold:true });
text('一律 3万円', 7.34, 4.73, 1.35, 0.30, { color:C.red, fontSize:16, bold:true });
text('Shopify利用料、メンテナンス費用、各種プラグインの月額費用、運用資産の軽微な改修費などを含みます。',
  6.20, 5.13, 4.75, 0.42, { color:C.black, fontSize:9.2 });
text('追加オプション / 追加機能', 6.20, 5.78, 2.0, 0.2, { color:C.black, fontSize:10.5, bold:true });
text('上記ミニマム構成からさらに機能を追加する場合は、その時点で内容を確認し、別途お見積もりします。',
  6.20, 6.08, 4.72, 0.36, { color:C.black, fontSize:9.5 });

// Lower notes strip
rect(0.38, 7.04, 10.92, 0.72, C.white, C.line, 0.10);
text('共通条件：基本的に資産はこちら側が保有し、運用もこちらで行います。資産を利用し続ける限り、成果報酬が発生します。ソースコードは開示するため、お客様自身でのカスタマイズも可能ですが、自己カスタマイズによりバグが発生した場合は運用保証の対象外となります。',
  0.62, 7.22, 10.40, 0.28, { color:C.gray, fontSize:8.8 });

pptx.writeFile({ fileName: '/Users/umi/.openclaw/workspace/ec_plan_estimate_draft_A4_landscape_v2.pptx' });
