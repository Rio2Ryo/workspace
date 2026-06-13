const fs = require('fs');
const { execFileSync } = require('child_process');
const pptxgen = require('pptxgenjs');

const base = '/Users/umi/.openclaw/workspace';
const svgPath = `${base}/2d-vending-machine-onepager-v5.svg`;
const pngPath = `${base}/2d-vending-machine-onepager-v5-preview.png`;
const pptxPath = `${base}/2d-vending-machine-onepager-v5.pptx`;
const W = 2400, H = 1350;

function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function t(str,x,y,o={}){ const ff=o.ff||`'Hiragino Sans','Yu Gothic','Noto Sans JP',Arial,sans-serif`; return `<text x="${x}" y="${y}" font-family="${ff}" font-size="${o.size||32}" font-weight="${o.weight||500}" fill="${o.fill||'#102A43'}" text-anchor="${o.anchor||'start'}" letter-spacing="${o.ls||0}">${esc(str)}</text>`; }
function ml(lines,x,y,o={}){ const lh=o.lh||Math.round((o.size||28)*1.45); return `<text x="${x}" y="${y}" font-family="${o.ff||`'Hiragino Sans','Yu Gothic','Noto Sans JP',Arial,sans-serif`}" font-size="${o.size||28}" font-weight="${o.weight||500}" fill="${o.fill||'#102A43'}" text-anchor="${o.anchor||'start'}">${lines.map((line,i)=>`<tspan x="${x}" dy="${i?lh:0}">${esc(line)}</tspan>`).join('')}</text>`; }
function r(x,y,w,h,rx,fill,stroke='none',sw=0,extra=''){ return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`; }
function c(cx,cy,rr,fill,extra=''){ return `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}" ${extra}/>`; }
function line(x1,y1,x2,y2,color='#fff',sw=4,extra=''){ return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" fill="none" ${extra}/>`; }
function pill(label,x,y,w,fill,txt='#061A2F'){ return `${r(x,y,w,44,22,fill)}${t(label,x+w/2,y+29,{size:20,weight:850,fill:txt,anchor:'middle'})}`; }
function product(i,x,y){ const colors=['#10D7F2','#34E6B5','#FFD166','#FF9F1C','#5B8CFF','#9A6BFF']; const names=['ITEM A','ITEM B','ITEM C','ITEM D','ITEM E','ITEM F']; return `<g filter="url(#tinyShadow)">
  ${r(x,y,162,116,24,'#FFFFFF','rgba(255,255,255,.5)',1)}
  ${r(x+18,y+18,126,44,16,colors[i])}
  ${c(x+81,y+40,18,'#FFFFFF','opacity="0.34"')}
  ${t(names[i],x+81,y+86,{size:22,weight:900,fill:'#071B33',anchor:'middle'})}
</g>`; }
function valueCard(num,title,sub,x,y,color,bg){ return `<g>
  ${r(x,y,560,106,30,bg,'#FFFFFF',0)}
  ${c(x+58,y+53,32,color)}
  ${t(num,x+58,y+64,{size:22,weight:900,fill:'#061A2F',anchor:'middle',ff:'Avenir,Arial,sans-serif'})}
  ${t(title,x+108,y+45,{size:30,weight:900,fill:'#071B33'})}
  ${t(sub,x+108,y+80,{size:21,weight:650,fill:'#5C7182'})}
</g>`; }
function step(n,title,sub,x){ return `<g>
  ${c(x,1190,27,['#10D7F2','#5B8CFF','#FFD166','#34E6B5'][n-1])}
  ${t(String(n),x,1200,{size:21,weight:900,fill:'#061A2F',anchor:'middle',ff:'Avenir,Arial,sans-serif'})}
  ${t(title,x+42,1186,{size:25,weight:900,fill:'#FFFFFF'})}
  ${t(sub,x+42,1219,{size:18,weight:650,fill:'#BCEEFF'})}
</g>`; }

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F9FCFF"/><stop offset="0.55" stop-color="#F2FAFD"/><stop offset="1" stop-color="#FFF7E8"/></linearGradient>
  <radialGradient id="orb1" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#10D7F2" stop-opacity=".36"/><stop offset="1" stop-color="#10D7F2" stop-opacity="0"/></radialGradient>
  <radialGradient id="orb2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFD166" stop-opacity=".34"/><stop offset="1" stop-color="#FFD166" stop-opacity="0"/></radialGradient>
  <linearGradient id="dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#061527"/><stop offset="0.52" stop-color="#092A47"/><stop offset="1" stop-color="#075875"/></linearGradient>
  <linearGradient id="board" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071B33"/><stop offset="0.6" stop-color="#0A3557"/><stop offset="1" stop-color="#076D89"/></linearGradient>
  <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10D7F2"/><stop offset="1" stop-color="#34E6B5"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE596"/><stop offset="1" stop-color="#FFB020"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="28" stdDeviation="34" flood-color="#12344F" flood-opacity=".20"/></filter>
  <filter id="tinyShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#12344F" flood-opacity=".16"/></filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>

${r(0,0,W,H,0,'url(#canvas)')}
<ellipse cx="2050" cy="90" rx="430" ry="430" fill="url(#orb1)"/>
<ellipse cx="80" cy="1270" rx="470" ry="360" fill="url(#orb2)"/>

<!-- Premium header -->
${r(0,0,W,132,0,'url(#dark)')}
${t('ONE PAGE PROPOSAL',110,80,{size:23,weight:900,fill:'#BDEFFF',ff:'Avenir,Arial,sans-serif',ls:2})}
${t('2D VENDING MACHINE',1910,80,{size:23,weight:900,fill:'#FFFFFF',ff:'Avenir,Arial,sans-serif',anchor:'middle',ls:2})}
${pill('NFC',2100,49,82,'url(#cyan)','#061A2F')}
${pill('QR',2196,49,72,'#FFD166','#061A2F')}

<!-- Left copy -->
${t('2D自販機',112,258,{size:84,weight:950,fill:'#061A2F'})}
${t('ポスターが、そのまま売り場になる。',116,326,{size:42,weight:900,fill:'#047EA5'})}
${ml(['現地のポスター・パネル・POPに商品枠を配置。','スマホのタッチ / QRで、購入・受取までつなげる','新しい“平面型販売ツール”です。'],118,394,{size:31,weight:560,fill:'#2A475C',lh:48})}
${pill('大型機器なし',118,573,156,'#FFFFFF','#0A3657')}
${pill('現地限定体験',294,573,176,'#FFFFFF','#0A3657')}
${pill('受取 / 配送対応',490,573,190,'#FFFFFF','#0A3657')}

<!-- Hero board area -->
<g filter="url(#shadow)">
${r(104,670,795,450,48,'url(#board)')}
${r(146,714,712,80,28,'#0E466B')}
${t('2D VENDING BOARD',186,765,{size:26,weight:950,fill:'#FFFFFF',ff:'Avenir,Arial,sans-serif',ls:1.2})}
${pill('タッチして購入',655,732,164,'url(#gold)','#061A2F')}
${product(0,166,840)}${product(1,374,840)}${product(2,582,840)}
${product(3,166,985)}${product(4,374,985)}${product(5,582,985)}
${r(168,1086,240,46,23,'#061527')}
${t('NFC',198,1118,{size:21,weight:950,fill:'#10D7F2',ff:'Avenir,Arial,sans-serif'})}
<path d="M270 1099 C292 1114 292 1114 270 1129" stroke="#10D7F2" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M296 1094 C330 1114 330 1114 296 1134" stroke="#10D7F2" stroke-width="5" fill="none" stroke-linecap="round" opacity=".75"/>
${t('かざす',348,1118,{size:18,weight:850,fill:'#FFFFFF'})}
${r(638,1067,78,78,12,'#FFFFFF')}
${Array.from({length:25}).map((_,idx)=>{const row=Math.floor(idx/5),col=idx%5; if(!(((row+col*2)%3===0)||(row<2&&col<2)||(row>2&&col>2))) return ''; return `<rect x="${653+col*11}" y="${1082+row*11}" width="7" height="7" fill="#061A2F"/>`;}).join('')}
${t('QR',736,1115,{size:22,weight:950,fill:'#FFFFFF',ff:'Avenir,Arial,sans-serif'})}
</g>

<!-- Floating phone -->
<g filter="url(#shadow)">
<path d="M836 1012 C900 955 985 938 1075 970" stroke="#FFB020" stroke-width="9" fill="none" stroke-linecap="round"/>
<path d="M1068 966 L1038 950 L1043 986 Z" fill="#FFB020"/>
${r(1000,823,116,224,30,'#102034')}
${r(1018,854,80,142,16,'#DFFBFF')}
${c(1058,1024,8,'#DFFBFF','opacity=".76"')}
<rect x="1035" y="890" width="46" height="34" rx="8" fill="#10D7F2" opacity=".85"/>
<path d="M1036 947 L1082 947" stroke="#10D7F2" stroke-width="6" stroke-linecap="round"/>
<path d="M1036 972 L1068 972" stroke="#34E6B5" stroke-width="6" stroke-linecap="round"/>
</g>

<!-- Right value panel -->
<g filter="url(#shadow)">${r(1190,210,1050,830,54,'#FFFFFF')}</g>
${t('導入価値',1268,302,{size:46,weight:950,fill:'#061A2F'})}
${t('売り場を増やすのではなく、現地体験そのものを購入導線にする。',1268,354,{size:26,weight:650,fill:'#5C7182'})}
${valueCard('01','現地受取をスムーズに','注文番号 / QR提示で受取所からすぐ受取',1268,420,'#10D7F2','#EAFBFF')}
${valueCard('02','事前購入で在庫確保','混雑時もファストパス的に受け取りだけ',1268,560,'#FFD166','#FFF6E3')}
${valueCard('03','配送・相談窓口にも対応','後日配送、スマホが苦手な方の窓口導線も用意',1268,700,'#34E6B5','#ECFFF8')}

<!-- Micro benefits -->
${r(1268,874,280,76,26,'#F8FBFF','#D8EEF6',2)}
${t('ユーザー',1302,908,{size:25,weight:950,fill:'#047EA5'})}
${t('簡単購入・待ち時間削減',1302,936,{size:18,weight:700,fill:'#5C7182'})}
${r(1582,874,280,76,26,'#F8FBFF','#D8EEF6',2)}
${t('事業者',1616,908,{size:25,weight:950,fill:'#047EA5'})}
${t('機器不要・商品差替え容易',1616,936,{size:18,weight:700,fill:'#5C7182'})}
${r(1890,874,250,76,26,'#F8FBFF','#D8EEF6',2)}
${t('活用',1924,908,{size:25,weight:950,fill:'#047EA5'})}
${t('イベント・ライブ会場',1924,936,{size:18,weight:700,fill:'#5C7182'})}

<!-- Flow -->
${r(104,1160,2132,106,53,'#061A2F')}
${t('FLOW',154,1223,{size:24,weight:950,fill:'#BDEFFF',ff:'Avenir,Arial,sans-serif',ls:2})}
${step(1,'見る','商品を選ぶ',312)}${line(590,1190,654,1190,'#65CFE8',5)}
${step(2,'触れる','NFC / QR',694)}${line(972,1190,1036,1190,'#65CFE8',5)}
${step(3,'買う','決済・受取選択',1076)}${line(1380,1190,1444,1190,'#65CFE8',5)}
${step(4,'受け取る','現地受取 / 配送',1484)}

${t('活用シーン：アイドル/アーティストグッズ ・ トレカ ・ イベント限定商品 ・ 観光地限定商品 ・ ポップアップ ・ 展示会 / ライブ会場',112,1320,{size:22,weight:750,fill:'#5C7182'})}
</svg>`;

fs.writeFileSync(svgPath, svg, 'utf8');
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new','--disable-gpu',`--screenshot=${pngPath}`,`--window-size=${W},${H}`,`file://${svgPath}`
], { stdio: 'ignore' });

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Shiro-mini';
pptx.subject = '2D自販機 一枚提案書 v5';
pptx.title = '2D自販機 提案書';
pptx.lang = 'ja-JP';
const slide = pptx.addSlide();
slide.background = { color: 'F8FBFF' };
slide.addImage({ path: pngPath, x:0, y:0, w:13.333, h:7.5 });
slide.addNotes(`説明トーク例:\n2D自販機は、ポスターやパネルをそのまま販売導線に変える仕組みです。ユーザーは現地で商品を見つけ、スマホでタッチまたはQR読み取りして購入できます。現地受取・オンライン配送の両方に対応し、事前購入による在庫確保、注文番号/QR提示によるスムーズな受取が可能です。物理自販機を置かずに展開できるため、イベント・店舗・観光地・ライブ会場などの限定販売や混雑緩和に向いています。`);
pptx.writeFile({ fileName: pptxPath });
console.log(JSON.stringify({svgPath,pngPath,pptxPath}, null, 2));
