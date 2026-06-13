const fs = require('fs');
const pptxgen = require('pptxgenjs');

const outSvg = '/Users/umi/.openclaw/workspace/2d-vending-machine-onepager-v3.svg';
const outPptx = '/Users/umi/.openclaw/workspace/2d-vending-machine-onepager-v3.pptx';

function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function tspans(lines, x, dy=1.25){ return lines.map((l,i)=>`<tspan x="${x}" dy="${i===0?0:dy}em">${esc(l)}</tspan>`).join(''); }

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F8FBFF"/>
      <stop offset="0.52" stop-color="#EEF8FC"/>
      <stop offset="1" stop-color="#FDFBF5"/>
    </linearGradient>
    <linearGradient id="navyGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#061A2F"/>
      <stop offset="0.65" stop-color="#0B3659"/>
      <stop offset="1" stop-color="#0BAFD2"/>
    </linearGradient>
    <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#09203A"/>
      <stop offset="0.6" stop-color="#0B3155"/>
      <stop offset="1" stop-color="#064A68"/>
    </linearGradient>
    <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#17D8F5"/>
      <stop offset="1" stop-color="#38F0C2"/>
    </linearGradient>
    <linearGradient id="amber" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFE08A"/>
      <stop offset="1" stop-color="#FFB020"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#12344F" flood-opacity="0.18"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#12344F" flood-opacity="0.12"/>
    </filter>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="18" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <style>
      .jp { font-family: 'Hiragino Sans', 'Yu Gothic', 'Noto Sans CJK JP', Arial, sans-serif; }
      .en { font-family: Avenir, 'Helvetica Neue', Arial, sans-serif; letter-spacing: .08em; }
      .small { font-size: 22px; fill: #5E7385; }
      .tiny { font-size: 18px; fill: #6A7F90; }
      .body { font-size: 25px; fill: #18344A; line-height: 1.45; }
      .label { font-size: 20px; font-weight: 700; fill: #0B2B4A; }
      .white { fill: #fff; }
      .mutedWhite { fill: #BDEFFF; }
      .bold { font-weight: 800; }
    </style>
  </defs>

  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="1380" cy="60" r="250" fill="#17D8F5" opacity="0.14"/>
  <circle cx="80" cy="800" r="260" fill="#FFD166" opacity="0.13"/>

  <!-- Top brand rail -->
  <rect x="0" y="0" width="1600" height="92" fill="url(#navyGrad)"/>
  <text x="70" y="54" class="en" font-size="18" font-weight="700" fill="#BDEFFF">ONE PAGE PROPOSAL</text>
  <text x="1300" y="54" class="en" font-size="18" font-weight="700" fill="#FFFFFF" opacity="0.92">NFC / QR / PICKUP</text>

  <!-- Title block -->
  <text x="70" y="166" class="jp bold" font-size="58" fill="#08223A">2D自販機</text>
  <text x="70" y="214" class="jp" font-size="28" font-weight="700" fill="#0B77A8">ポスターが、そのまま自販機になる。</text>
  <text x="70" y="258" class="jp body">${tspans(['平面のポスター・パネル・POPに商品枠を置き、','スマホのタッチ / QRで購入・受取までつなげる販売導線。'],70,1.32)}</text>

  <!-- Hero vending mock -->
  <g filter="url(#shadow)">
    <rect x="80" y="326" width="650" height="462" rx="38" fill="url(#heroGrad)"/>
    <rect x="112" y="360" width="586" height="70" rx="22" fill="#0E466B" opacity="0.92"/>
    <text x="144" y="405" class="en" font-size="20" font-weight="800" fill="#FFFFFF">2D VENDING BOARD</text>
    <rect x="510" y="374" width="148" height="34" rx="17" fill="url(#amber)"/>
    <text x="540" y="397" class="jp" font-size="18" font-weight="800" fill="#08223A">タッチ購入</text>

    <!-- product cards -->
    ${[0,1,2,3,4,5].map(i=>{
      const col=i%3,row=Math.floor(i/3), x=132+col*178, y=464+row*134;
      const colors=['#17D8F5','#38F0C2','#FFD166','#FF9F1C','#5A8CFF','#A06BFF'];
      const names=['限定A','限定B','限定C','会場限定','推し活','観光'];
      return `<g>
        <rect x="${x}" y="${y}" width="142" height="104" rx="18" fill="#FFFFFF" opacity="0.96"/>
        <rect x="${x+14}" y="${y+14}" width="114" height="42" rx="13" fill="${colors[i]}" opacity="0.95"/>
        <circle cx="${x+71}" cy="${y+35}" r="17" fill="#FFFFFF" opacity="0.35"/>
        <text x="${x+71}" y="${y+77}" text-anchor="middle" class="jp" font-size="19" font-weight="800" fill="#08223A">${names[i]}</text>
        <text x="${x+71}" y="${y+96}" text-anchor="middle" class="jp" font-size="14" fill="#6A7F90">商品枠</text>
      </g>`;
    }).join('\n')}

    <!-- NFC and QR base -->
    <rect x="135" y="724" width="215" height="42" rx="21" fill="#071B33"/>
    <text x="164" y="752" class="en" font-size="18" font-weight="900" fill="#17D8F5">NFC</text>
    <path d="M222 735 C240 746 240 746 222 758" stroke="#17D8F5" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M240 730 C266 746 266 746 240 762" stroke="#17D8F5" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.75"/>
    <text x="279" y="752" class="jp" font-size="16" font-weight="700" fill="#FFFFFF">かざす</text>
    <rect x="500" y="706" width="70" height="70" rx="10" fill="#FFFFFF"/>
    ${Array.from({length:25}).map((_,idx)=>{const r=Math.floor(idx/5),c=idx%5; if(!(((r+c*2)%3===0)||(r<2&&c<2)||(r>2&&c>2))) return ''; return `<rect x="${512+c*10}" y="${718+r*10}" width="7" height="7" fill="#08223A"/>`;}).join('')}
    <text x="586" y="748" class="en" font-size="18" font-weight="900" fill="#FFFFFF">QR</text>
  </g>

  <!-- Phone + motion -->
  <g filter="url(#softShadow)">
    <path d="M612 672 C662 650 694 646 744 656" stroke="#FFB020" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M738 655 L720 644 L723 666 Z" fill="#FFB020"/>
    <rect x="724" y="570" width="72" height="142" rx="18" fill="#11263C"/>
    <rect x="734" y="590" width="52" height="94" rx="10" fill="#DFFBFF"/>
    <circle cx="760" cy="696" r="5" fill="#DFFBFF" opacity="0.75"/>
  </g>

  <!-- Right bento panel -->
  <g filter="url(#shadow)">
    <rect x="805" y="150" width="710" height="638" rx="38" fill="#FFFFFF"/>
  </g>
  <text x="858" y="207" class="jp" font-size="28" font-weight="800" fill="#08223A">導入価値</text>
  <text x="858" y="246" class="jp small">大型機器なしで、現地限定の購買体験と販売オペレーションを同時に作る。</text>

  <!-- value cards -->
  <g>
    <rect x="858" y="286" width="195" height="154" rx="24" fill="#EAFBFF"/>
    <circle cx="902" cy="330" r="23" fill="#17D8F5"/>
    <text x="902" y="338" text-anchor="middle" class="en" font-size="17" font-weight="900" fill="#08223A">01</text>
    <text x="858" y="380" class="jp label">現地受取</text>
    <text x="858" y="410" class="jp tiny">注文番号 / QR提示で、\n受取所からスムーズに受取。</text>
  </g>
  <g>
    <rect x="1082" y="286" width="195" height="154" rx="24" fill="#FFF6E3"/>
    <circle cx="1126" cy="330" r="23" fill="#FFD166"/>
    <text x="1126" y="338" text-anchor="middle" class="en" font-size="17" font-weight="900" fill="#08223A">02</text>
    <text x="1082" y="380" class="jp label">在庫確保</text>
    <text x="1082" y="410" class="jp tiny">事前購入で商品を確保。\n混雑時もファストパス的に。</text>
  </g>
  <g>
    <rect x="1306" y="286" width="155" height="154" rx="24" fill="#ECFFF8"/>
    <circle cx="1350" cy="330" r="23" fill="#38F0C2"/>
    <text x="1350" y="338" text-anchor="middle" class="en" font-size="17" font-weight="900" fill="#08223A">03</text>
    <text x="1306" y="380" class="jp label">配送対応</text>
    <text x="1306" y="410" class="jp tiny">荷物を増やさず、\n後日配送も選べる。</text>
  </g>

  <!-- two columns benefits -->
  <rect x="858" y="486" width="285" height="176" rx="26" fill="#F8FBFF" stroke="#D8EEF6"/>
  <text x="890" y="528" class="jp" font-size="23" font-weight="800" fill="#0B77A8">ユーザー</text>
  <text x="890" y="568" class="jp tiny">• 現地限定感がある\n• スマホだけで簡単購入\n• 待ち時間・購入ストレスを削減</text>

  <rect x="1176" y="486" width="285" height="176" rx="26" fill="#F8FBFF" stroke="#D8EEF6"/>
  <text x="1208" y="528" class="jp" font-size="23" font-weight="800" fill="#0B77A8">事業者</text>
  <text x="1208" y="568" class="jp tiny">• 物理自販機なしで展開\n• 商品差し替えが簡単\n• 在庫 / 受取 / 配送を管理</text>

  <!-- Flow -->
  <rect x="858" y="702" width="603" height="52" rx="26" fill="#08223A"/>
  ${[['見る','商品を選ぶ'],['触れる','NFC / QR'],['買う','決済'],['受け取る','現地 / 配送']].map((f,i)=>{
    const x=890+i*145;
    return `<g>
      <circle cx="${x}" cy="728" r="17" fill="${['#17D8F5','#5A8CFF','#FFD166','#38F0C2'][i]}"/>
      <text x="${x}" y="735" text-anchor="middle" class="en" font-size="14" font-weight="900" fill="#08223A">${i+1}</text>
      <text x="${x+28}" y="724" class="jp" font-size="16" font-weight="800" fill="#FFFFFF">${f[0]}</text>
      <text x="${x+28}" y="744" class="jp" font-size="12" fill="#BDEFFF">${f[1]}</text>
      ${i<3?`<path d="M${x+112} 728 L${x+126} 728" stroke="#6ECFE8" stroke-width="3" stroke-linecap="round"/>`:''}
    </g>`;
  }).join('\n')}

  <!-- Footer tags -->
  <text x="70" y="844" class="jp" font-size="20" font-weight="800" fill="#08223A">活用シーン</text>
  ${['アイドル/アーティストグッズ','トレカ','イベント限定商品','観光地限定商品','ポップアップ','展示会・ライブ会場'].map((t,i)=>{
    const widths=[250,74,170,170,124,170];
    const x=[190,458,550,738,926,1068][i];
    return `<rect x="${x}" y="819" width="${widths[i]}" height="38" rx="19" fill="#FFFFFF" stroke="#D8EEF6"/><text x="${x+widths[i]/2}" y="844" text-anchor="middle" class="jp" font-size="16" font-weight="700" fill="#36566C">${t}</text>`;
  }).join('\n')}
</svg>`;
fs.writeFileSync(outSvg, svg);

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Shiro-mini';
pptx.subject = '2D自販機 一枚提案書 v3';
pptx.title = '2D自販機 提案書';
pptx.lang = 'ja-JP';
pptx.theme = { headFontFace: 'Hiragino Sans', bodyFontFace: 'Hiragino Sans', lang: 'ja-JP' };
const slide = pptx.addSlide();
slide.background = { color: 'F8FBFF' };
slide.addImage({ data: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), x:0, y:0, w:13.333, h:7.5 });
slide.addNotes(`説明トーク例:\n2D自販機は、ポスターやパネルをそのまま販売導線に変える仕組みです。ユーザーは現地で商品を見つけ、スマホでタッチまたはQR読み取りして購入できます。現地受取・オンライン配送の両方に対応し、事前購入による在庫確保、注文番号/QR提示によるスムーズな受取が可能です。物理自販機を置かずに展開できるため、イベント・店舗・観光地・ライブ会場などの限定販売や混雑緩和に向いています。`);
pptx.writeFile({ fileName: outPptx });
console.log(outPptx);
