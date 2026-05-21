import pptxgen from '../pptxgenjs.mjs';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'slide-tool/out/kataomoi-premium-visual';
fs.mkdirSync(outDir, { recursive: true });

const imgs = {
  cover: '/Users/umi/.openclaw/media/tool-image-generation/kataomoi-cover-premium---0471834e-4830-4976-b6c1-fb6b835e210e.png',
  nfc: '/Users/umi/.openclaw/media/tool-image-generation/kataomoi-nfc-touch-premium---f75ca4c4-eb0f-4e10-a1a4-577fcd9c8403.png',
  network: '/Users/umi/.openclaw/media/tool-image-generation/kataomoi-network-premium---625d7c94-5da5-4ba4-a444-c0ee2a2de1e3.png',
  apps: '/Users/umi/.openclaw/media/tool-image-generation/kataomoi-ai-apps-premium---2ec5524e-7289-4f50-90a6-4db38335659d.png',
};

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Shiro Slide Studio';
pptx.company = 'KATAOMOI / OpenClaw';
pptx.subject = 'Premium visual deck prototype';
pptx.title = 'KATAOMOI.org Premium Visual Deck';
pptx.lang = 'ja-JP';
pptx.theme = { headFontFace: 'Yu Gothic', bodyFontFace: 'Yu Gothic', lang: 'ja-JP' };
pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });

const C = {
  black: '05060A',
  ivory: 'FFF5DD',
  gold: 'D8B15F',
  softGold: 'F3DFA4',
  muted: 'B9AA8E',
  coral: 'E86758',
  darkPanel: '101014',
};

function addBg(slide, image) {
  slide.background = { color: C.black };
  slide.addImage({ path: image, x: 0, y: 0, w: 13.333, h: 7.5, transparency: 0 });
  // left readability veil
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 6.8, h: 7.5, fill: { color: C.black, transparency: 8 }, line: { transparency: 100 } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.black, transparency: 74 }, line: { transparency: 100 } });
}
function tx(slide, text, x, y, w, h, opt={}) {
  slide.addText(text, { x, y, w, h, fontFace: 'Hiragino Sans', color: opt.color || C.ivory, fontSize: opt.size || 18, bold: opt.bold ?? false, margin: 0, fit: 'shrink', breakLine: false, valign: opt.valign || 'top', align: opt.align || 'left', paraSpaceAfterPt: 0, lineSpacingMultiple: opt.line || 0.9, transparency: opt.transparency || 0 });
}
function kicker(slide, n, label='KATAOMOI.org') {
  tx(slide, `${String(n).padStart(2,'0')}  ${label}`, 0.62, 0.48, 3.4, 0.22, { size: 8.5, color: C.muted, bold: true });
  slide.addShape(pptx.ShapeType.line, { x: 0.62, y: 0.82, w: 1.1, h: 0, line: { color: C.gold, width: 1.2, transparency: 10 } });
}
function bullets(slide, items, x, y, w, size=13) {
  items.forEach((b,i)=>{
    slide.addShape(pptx.ShapeType.ellipse, { x, y: y+i*0.45+0.055, w: 0.08, h: 0.08, fill: { color: C.gold }, line: { transparency: 100 } });
    tx(slide, b, x+0.18, y+i*0.45, w, 0.23, { size, color: C.ivory });
  });
}
function card(slide, x,y,w,h,title,body,accent=C.gold) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: '0C0D12', transparency: 8 }, line: { color: '3E3424', transparency: 15, width: 0.8 } });
  slide.addShape(pptx.ShapeType.line, { x: x+0.22, y: y+0.22, w: 0.72, h: 0, line: { color: accent, width: 2 } });
  tx(slide, title, x+0.22, y+0.43, w-0.44, 0.28, { size: 13.5, color: C.softGold, bold: true });
  tx(slide, body, x+0.22, y+0.86, w-0.44, h-1.0, { size: 10.8, color: 'EDE2CA' });
}

// 1 cover
{
  const s = pptx.addSlide(); addBg(s, imgs.cover); kicker(s,1,'KATAOMOI.org / Proposal');
  tx(s, 'NFC名刺から、\n営業OSへ。', 0.7, 1.22, 5.7, 1.62, { size: 37, bold: true, color: C.ivory, line: 0.82 });
  tx(s, 'KATAOMOI.org｜NFC smart card × AI relationship automation', 0.74, 3.14, 5.7, 0.32, { size: 12.8, color: C.softGold, bold: true });
  tx(s, '商談後フォローまで自動化し、営業機会を逃さない。\n紙の名刺を入口に、相手別の導線とAIによる関係育成を設計する。', 0.74, 3.76, 5.35, 0.88, { size: 14.4, color: 'EDE2CA' });
  slideFooter(s);
}

function slideFooter(s){ tx(s,'KATAOMOI — First impression to relationship OS',0.7,6.86,4.8,0.18,{size:8.5,color:'8D816B'}); }

// 2 problem
{
 const s=pptx.addSlide(); addBg(s, imgs.nfc); kicker(s,2);
 tx(s,'名刺交換は、\nまだ活かしきれていない。',0.7,1.0,5.8,1.18,{size:30,bold:true,line:0.84});
 tx(s,'交換した瞬間がピークで、後日のフォロー・採用・紹介・購買導線につながりにくい。',0.74,2.52,5.0,0.62,{size:14.8,color:'EDE2CA'});
 card(s,0.74,3.65,2.15,1.45,'記憶に残らない','QRや紙面情報だけでは、会話の熱量が冷めやすい。');
 card(s,3.08,3.65,2.15,1.45,'フォローが遅い','相手別の資料や導線を後から手作業で送る。',C.coral);
 card(s,5.42,3.65,2.15,1.45,'接点が見えない','人脈の濃度が営業資産として可視化されない。');
 slideFooter(s);
}

// 3 product
{
 const s=pptx.addSlide(); addBg(s, imgs.nfc); kicker(s,3);
 tx(s,'KATAOMOI名刺',0.7,0.98,5.4,0.48,{size:30,bold:true});
 tx(s,'紙の温もりを残したまま、\nスマホに“次の行動”を届ける。',0.72,1.7,5.25,0.82,{size:24,bold:true,color:C.softGold,line:0.86});
 bullets(s,['NFC内蔵。スマホをかざすだけで情報共有','ブランドに合わせたオリジナルデザイン','SNS・予約・EC・営業資料・採用ページへ連携','相手に合わせてタッチ先URLを変更可能'],0.8,3.05,4.9,13.2);
 card(s,8.6,1.1,3.65,1.2,'体験価値','「普通の紙名刺なのに反応する」驚きが、自然な会話のきっかけになる。');
 card(s,8.6,2.65,3.65,1.2,'営業価値','交換の瞬間に、相手専用のランディングページへ誘導できる。',C.coral);
 slideFooter(s);
}

// 4 relationship OS
{
 const s=pptx.addSlide(); addBg(s, imgs.network); kicker(s,4);
 tx(s,'人脈を、\n感覚から資産へ。',0.7,1.02,5.4,1.12,{size:31,bold:true,line:0.84});
 tx(s,'接触回数・AI会話量・対面時間などを組み合わせ、親密度を可視化する。',0.74,2.52,5.05,0.55,{size:14.5,color:'EDE2CA'});
 card(s,0.74,3.62,2.25,1.35,'見える','距離が近いほど親密度が高い人脈マップ。');
 card(s,3.18,3.62,2.25,1.35,'測れる','複数パラメータで関係性を自動算出。');
 card(s,5.62,3.62,2.25,1.35,'証明できる','紹介者としての信頼度をブロックチェーンで証明。',C.coral);
 slideFooter(s);
}

// 5 AI apps
{
 const s=pptx.addSlide(); addBg(s, imgs.apps); kicker(s,5);
 tx(s,'AI駆動アプリ開発',0.7,0.98,5.5,0.48,{size:30,bold:true});
 tx(s,'AIが使う前提で設計されたアプリが、\nビジネスを自動で動かす。',0.72,1.7,5.35,0.82,{size:23.5,bold:true,color:C.softGold,line:0.86});
 card(s,0.76,3.18,2.0,1.34,'早い','AIエージェントが並列開発。MVPを短期間で形にする。');
 card(s,3.0,3.18,2.0,1.34,'安い','スモールスタートから拡張しやすい。');
 card(s,5.24,3.18,2.0,1.34,'高品質','人間が設計・レビューで品質を担保。',C.coral);
 bullets(s,['写真DLスポンサーアプリ：DL数3倍','CO2算出SaaS：工数90%削減','メールクライアント：処理時間70%短縮','分身AI：投稿頻度5倍'],0.8,5.2,5.1,11.5);
 slideFooter(s);
}

// 6 close
{
 const s=pptx.addSlide(); addBg(s, imgs.cover); kicker(s,6,'Closing');
 tx(s,'片思いの営業を、\n両思いのビジネスへ。',0.7,1.08,6.2,1.3,{size:31,bold:true,line:0.86});
 tx(s,'KATAOMOIは、第一印象・営業導線・人脈可視化・AI自動化をひとつにつなぐ接点OSです。',0.74,2.75,5.2,0.62,{size:15,color:'EDE2CA'});
 bullets(s,['まずはKATAOMOI名刺で第一印象を変える','カード購入者はKATAOMOIアプリへ優先アクセス','AIアプリ開発で業務と接点を自動化する'],0.82,3.72,5.0,13.2);
 tx(s,'Beta reservation / Product consultation',0.78,6.1,4.5,0.28,{size:13.5,bold:true,color:C.softGold});
 slideFooter(s);
}

await pptx.writeFile({ fileName: path.join(outDir,'kataomoi-premium-visual.pptx') });
console.log(JSON.stringify({ pptx: path.join(outDir,'kataomoi-premium-visual.pptx'), slides: pptx._slides.length }, null, 2));
