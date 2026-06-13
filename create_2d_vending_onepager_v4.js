const fs = require('fs');
const { execFileSync } = require('child_process');
const pptxgen = require('pptxgenjs');

const base = '/Users/umi/.openclaw/workspace';
const svgPath = `${base}/2d-vending-machine-onepager-v4.svg`;
const pngPath = `${base}/2d-vending-machine-onepager-v4-preview.png`;
const pptxPath = `${base}/2d-vending-machine-onepager-v4.pptx`;

const W = 1600, H = 900;
function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function text(lines, x, y, opts={}) {
  if (!Array.isArray(lines)) lines = [lines];
  const size = opts.size || 24;
  const fill = opts.fill || '#102A43';
  const weight = opts.weight || 400;
  const anchor = opts.anchor || 'start';
  const family = opts.family || `'Hiragino Sans','Yu Gothic','Noto Sans JP',Arial,sans-serif`;
  const lineH = opts.lineH || Math.round(size*1.45);
  const cls = opts.cls || '';
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" class="${cls}">${lines.map((l,i)=>`<tspan x="${x}" dy="${i===0?0:lineH}">${esc(l)}</tspan>`).join('')}</text>`;
}
function rect(x,y,w,h,r,fill,stroke='none',sw=0, extra=''){ return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`; }
function circle(cx,cy,r,fill, extra=''){ return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`; }
function pill(label,x,y,w,fill='#fff',txt='#0B2B4A'){ return `${rect(x,y,w,34,17,fill)}${text(label,x+w/2,y+23,{size:16,weight:800,fill:txt,anchor:'middle',family:`Avenir,'Hiragino Sans',sans-serif`})}`; }
function flowStep(n,title,sub,x,color){ return `<g>
  ${circle(x,782,22,color)}
  ${text(n,x,790,{size:18,weight:900,fill:'#08223A',anchor:'middle',family:`Avenir,Arial,sans-serif`})}
  ${text(title,x+38,773,{size:22,weight:800,fill:'#FFFFFF'})}
  ${text(sub,x+38,801,{size:15,weight:600,fill:'#BDEFFF'})}
</g>`; }

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8FBFF"/><stop offset="0.55" stop-color="#F1FAFD"/><stop offset="1" stop-color="#FFF9ED"/></linearGradient>
  <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#061A2F"/><stop offset="0.65" stop-color="#0B3659"/><stop offset="1" stop-color="#008DB2"/></linearGradient>
  <linearGradient id="board" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#08223A"/><stop offset="0.58" stop-color="#0E3B60"/><stop offset="1" stop-color="#075F7A"/></linearGradient>
  <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12D6F3"/><stop offset="1" stop-color="#38F0C2"/></linearGradient>
  <linearGradient id="amber" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#FFB020"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#12344F" flood-opacity="0.18"/></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#12344F" flood-opacity="0.12"/></filter>
</defs>

${rect(0,0,W,H,0,'url(#bg)')}
${circle(1380,70,285,'#12D6F3','opacity="0.12"')}
${circle(20,820,290,'#FFD166','opacity="0.13"')}
${rect(0,0,W,92,0,'url(#navy)')}
${text('ONE PAGE PROPOSAL',70,56,{size:18,weight:800,fill:'#BDEFFF',family:`Avenir,Arial,sans-serif`})}
${text('2D VENDING MACHINE',1284,56,{size:18,weight:800,fill:'#FFFFFF',family:`Avenir,Arial,sans-serif`})}

<!-- Title -->
${text('2D自販機',70,166,{size:62,weight:900,fill:'#08223A'})}
${text('ポスターが、そのまま自販機になる。',72,220,{size:30,weight:800,fill:'#067CA3'})}
${text(['平面のポスター・パネル・POPに商品枠を置き、','スマホのタッチ / QRで購入・受取までつなげる販売導線。'],72,270,{size:25,weight:500,fill:'#29475D',lineH:36})}

<!-- Hero board -->
<g filter="url(#shadow)">
${rect(82,345,642,392,38,'url(#board)')}
${rect(116,377,574,66,22,'#0E466B')}
${text('2D VENDING BOARD',146,418,{size:20,weight:900,fill:'#FFFFFF',family:`Avenir,Arial,sans-serif`})}
${pill('タッチして購入',520,392,132,'url(#amber)','#08223A')}
${[0,1,2,3,4,5].map(i=>{const col=i%3,row=Math.floor(i/3),x=132+col*180,y=472+row*112; const colors=['#12D6F3','#38F0C2','#FFD166','#FF9F1C','#5A8CFF','#7C5CFF']; const names=['限定A','限定B','限定C','会場限定','推し活','観光']; return `<g>${rect(x,y,145,84,18,'#FFFFFF','none',0,'opacity="0.97"')}${rect(x+13,y+12,119,30,12,colors[i])}${circle(x+72,y+27,13,'#FFFFFF','opacity="0.35"')}${text(names[i],x+72,y+62,{size:18,weight:850,fill:'#08223A',anchor:'middle'})}</g>`;}).join('')}
${rect(132,687,214,38,19,'#061A2F')}
${text('NFC',164,713,{size:18,weight:900,fill:'#12D6F3',family:`Avenir,Arial,sans-serif`})}
<path d="M224 699 C240 712 240 712 224 725" stroke="#12D6F3" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M243 694 C269 712 269 712 243 730" stroke="#12D6F3" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.75"/>
${text('かざす',286,713,{size:16,weight:800,fill:'#FFFFFF'})}
${rect(506,673,64,64,10,'#FFFFFF')}
${Array.from({length:25}).map((_,idx)=>{const r=Math.floor(idx/5),c=idx%5; if(!(((r+c*2)%3===0)||(r<2&&c<2)||(r>2&&c>2))) return ''; return `<rect x="${518+c*9}" y="${685+r*9}" width="6" height="6" fill="#08223A"/>`;}).join('')}
${text('QR',586,711,{size:18,weight:900,fill:'#FFFFFF',family:`Avenir,Arial,sans-serif`})}
</g>

<!-- Phone -->
<g filter="url(#soft)">
<path d="M610 652 C655 628 700 626 742 642" stroke="#FFB020" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M737 640 L719 631 L722 652 Z" fill="#FFB020"/>
${rect(722,556,74,146,18,'#11263C')}
${rect(733,578,52,94,10,'#DFFBFF')}
${circle(759,687,5,'#DFFBFF','opacity="0.75"')}
</g>

<!-- Right panel -->
<g filter="url(#shadow)">${rect(805,148,710,590,38,'#FFFFFF')}</g>
${text('導入価値',858,210,{size:31,weight:900,fill:'#08223A'})}
${text('大型機器なしで、現地限定の購買体験と販売オペレーションを同時に作る。',858,250,{size:21,weight:600,fill:'#5E7385'})}

<!-- 3 horizontal cards -->
${rect(858,294,602,88,24,'#EAFBFF')}
${circle(904,338,25,'#12D6F3')}${text('01',904,347,{size:18,weight:900,fill:'#08223A',anchor:'middle',family:`Avenir,Arial,sans-serif`})}
${text('現地受取',950,330,{size:25,weight:900,fill:'#08223A'})}
${text('注文番号 / QR提示で、受取所からスムーズに受取。',950,361,{size:19,weight:600,fill:'#5E7385'})}

${rect(858,408,602,88,24,'#FFF6E3')}
${circle(904,452,25,'#FFD166')}${text('02',904,461,{size:18,weight:900,fill:'#08223A',anchor:'middle',family:`Avenir,Arial,sans-serif`})}
${text('事前購入で在庫確保',950,444,{size:25,weight:900,fill:'#08223A'})}
${text('混雑時も、ファストパス的に受け取りだけで完了。',950,475,{size:19,weight:600,fill:'#5E7385'})}

${rect(858,522,602,88,24,'#ECFFF8')}
${circle(904,566,25,'#38F0C2')}${text('03',904,575,{size:18,weight:900,fill:'#08223A',anchor:'middle',family:`Avenir,Arial,sans-serif`})}
${text('配送・相談窓口にも対応',950,558,{size:25,weight:900,fill:'#08223A'})}
${text('後日配送、スマホ操作が難しい方への窓口導線も用意。',950,589,{size:19,weight:600,fill:'#5E7385'})}

<!-- Benefit footer in panel -->
${rect(858,642,284,62,22,'#F8FBFF','#D8EEF6',2)}
${text('ユーザー',884,670,{size:20,weight:900,fill:'#067CA3'})}
${text('簡単購入・待ち時間削減',884,695,{size:15,weight:700,fill:'#5E7385'})}
${rect(1176,642,284,62,22,'#F8FBFF','#D8EEF6',2)}
${text('事業者',1202,670,{size:20,weight:900,fill:'#067CA3'})}
${text('機器不要・差替え容易',1202,695,{size:15,weight:700,fill:'#5E7385'})}

<!-- Flow band -->
${rect(70,744,1460,68,34,'#08223A')}
${text('FLOW',102,787,{size:18,weight:900,fill:'#BDEFFF',family:`Avenir,Arial,sans-serif`})}
${flowStep('1','見る','商品を選ぶ',210,'#12D6F3')}
<path d="M424 782 L470 782" stroke="#65CFE8" stroke-width="4" stroke-linecap="round"/>
${flowStep('2','触れる','NFC / QR',500,'#5A8CFF')}
<path d="M716 782 L762 782" stroke="#65CFE8" stroke-width="4" stroke-linecap="round"/>
${flowStep('3','買う','決済・受取選択',792,'#FFD166')}
<path d="M1018 782 L1064 782" stroke="#65CFE8" stroke-width="4" stroke-linecap="round"/>
${flowStep('4','受け取る','現地受取 / 配送',1094,'#38F0C2')}

<!-- Footer use cases -->
${text('活用：アイドル/アーティストグッズ ・ トレカ ・ イベント限定商品 ・ 観光地限定商品 ・ ポップアップ ・ 展示会/ライブ会場',72,858,{size:17,weight:700,fill:'#5E7385'})}
</svg>`;

fs.writeFileSync(svgPath, svg, 'utf8');
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new','--disable-gpu',`--screenshot=${pngPath}`,`--window-size=${W},${H}`,`file://${svgPath}`
], { stdio: 'ignore' });

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Shiro-mini';
pptx.subject = '2D自販機 一枚提案書 v4';
pptx.title = '2D自販機 提案書';
pptx.lang = 'ja-JP';
const slide = pptx.addSlide();
slide.background = { color: 'F8FBFF' };
slide.addImage({ path: pngPath, x:0, y:0, w:13.333, h:7.5 });
slide.addNotes(`説明トーク例:\n2D自販機は、ポスターやパネルをそのまま販売導線に変える仕組みです。ユーザーは現地で商品を見つけ、スマホでタッチまたはQR読み取りして購入できます。現地受取・オンライン配送の両方に対応し、事前購入による在庫確保、注文番号/QR提示によるスムーズな受取が可能です。物理自販機を置かずに展開できるため、イベント・店舗・観光地・ライブ会場などの限定販売や混雑緩和に向いています。`);
pptx.writeFile({ fileName: pptxPath });
console.log(JSON.stringify({svgPath,pngPath,pptxPath}, null, 2));
