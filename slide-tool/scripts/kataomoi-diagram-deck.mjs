import pptxgen from '../pptxgenjs.mjs';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'slide-tool/out/kataomoi-diagram-deck';
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'kataomoi-diagram-deck.pptx');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Shiro Slide Studio';
pptx.company = 'KATAOMOI / OpenClaw';
pptx.subject = 'Diagram-first business deck';
pptx.title = 'KATAOMOI Diagram-first Deck';
pptx.lang = 'ja-JP';
pptx.theme = { headFontFace: 'Hiragino Sans', bodyFontFace: 'Hiragino Sans', lang: 'ja-JP' };

const C = {
  bg: '07080C', panel: '101217', panel2: '171923', ivory: 'FFF5DD', text: 'F5EAD3', muted: 'B9AA8E',
  gold: 'D8B15F', softGold: 'F3DFA4', coral: 'E86758', teal: '53C7B3', blue: '5C8DFF', line: '3B3427', dark: '0A0B10'
};
const W = 13.333, H = 7.5;
function bg(s){ s.background={color:C.bg}; s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:W,h:H,fill:{color:C.bg},line:{transparency:100}}); s.addShape(pptx.ShapeType.arc,{x:8.6,y:-1.0,w:5,h:5,line:{color:C.gold,transparency:76,width:1.5},adjustPoint:0.2}); s.addShape(pptx.ShapeType.arc,{x:9.4,y:4.0,w:4.6,h:4.6,line:{color:C.teal,transparency:82,width:1.1},adjustPoint:0.2}); }
function t(s,txt,x,y,w,h,o={}){s.addText(txt,{x,y,w,h,fontFace:'Hiragino Sans',fontSize:o.size||14,bold:o.bold||false,color:o.color||C.text,margin:o.margin??0,fit:'shrink',breakLine:false,valign:o.valign||'top',align:o.align||'left',paraSpaceAfterPt:0,lineSpacingMultiple:o.line||0.9});}
function title(s,n,txt,sub){t(s,`${String(n).padStart(2,'0')}  KATAOMOI.org`,0.58,0.36,3.2,0.18,{size:8.5,color:C.muted,bold:true}); s.addShape(pptx.ShapeType.line,{x:0.58,y:0.7,w:0.9,h:0,line:{color:C.gold,width:1.2}}); t(s,txt,0.58,0.9,7.7,0.7,{size:25.5,bold:true,color:C.ivory}); if(sub)t(s,sub,0.62,1.65,6.2,0.34,{size:12.5,color:C.muted});}
function pill(s,txt,x,y,w,color=C.gold){s.addShape(pptx.ShapeType.roundRect,{x,y,w,h:0.34,rectRadius:0.05,fill:{color,transparency:10},line:{transparency:100}});t(s,txt,x+0.12,y+0.08,w-0.24,0.1,{size:8.8,color:C.bg,bold:true,align:'center'});}
function box(s,x,y,w,h,head,body,o={}){s.addShape(pptx.ShapeType.roundRect,{x,y,w,h,rectRadius:0.06,fill:{color:o.fill||C.panel,transparency:o.trans??0},line:{color:o.line||C.line,width:0.8,transparency:10}}); if(o.num){s.addShape(pptx.ShapeType.ellipse,{x:x+0.16,y:y+0.18,w:0.34,h:0.34,fill:{color:o.accent||C.gold},line:{transparency:100}});t(s,String(o.num),x+0.16,y+0.255,0.34,0.08,{size:8,color:C.bg,bold:true,align:'center'});} t(s,head,x+0.22+(o.num?0.42:0),y+0.19,w-0.42,0.23,{size:o.headSize||12.5,bold:true,color:o.headColor||C.softGold}); t(s,body,x+0.22,y+0.62,w-0.44,h-0.72,{size:o.bodySize||9.5,color:o.bodyColor||C.text,line:0.98});}
function arrow(s,x1,y1,x2,y2,color=C.gold){s.addShape(pptx.ShapeType.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color,width:1.8,beginArrowType:'none',endArrowType:'triangle'}});}
function footer(s){t(s,'Diagram-first prototype: every visual must explain the claim',0.58,7.07,5.0,0.15,{size:7.8,color:'7E735F'});}

// 1 Cover / value mechanism
{const s=pptx.addSlide(); bg(s); t(s,'名刺交換を、\n商談後フォローまで自動化する。',0.72,0.95,7.0,1.15,{size:28.5,bold:true,color:C.ivory,line:0.86}); t(s,'KATAOMOI.org｜NFC smart card × AI relationship automation',0.76,2.34,6.8,0.28,{size:11.5,color:C.softGold,bold:true}); t(s,'“渡して終わり”の名刺を、相手別導線・追客・人脈可視化までつながる営業OSに変える。',0.76,2.83,6.45,0.38,{size:12.5,color:C.text});
 const y=4.05; const items=[['出会い','NFC名刺\nイベントカード'],['出し分け','相手別LP\n資料/採用/予約'],['追客','分身AI\nメール/CRM連携'],['可視化','親密度\n紹介信頼度'],['成果','商談化率向上\n紹介創出']];
 items.forEach((it,i)=>{const x=0.72+i*2.43; box(s,x,y,1.75,1.02,it[0],it[1],{num:i+1,fill:i===4?'251A0A':'11131A',headColor:i===4?C.softGold:C.gold,bodySize:8.8}); if(i<items.length-1)arrow(s,x+1.82,y+0.5,x+2.34,y+0.5,i===3?C.coral:C.gold);});
 t(s,'INPUT',0.78,5.42,1.0,0.13,{size:7.5,color:C.muted,bold:true}); t(s,'AUTOMATION',5.2,5.42,1.5,0.13,{size:7.5,color:C.muted,bold:true,align:'center'}); t(s,'BUSINESS OUTCOME',10.38,5.42,2.0,0.13,{size:7.5,color:C.muted,bold:true,align:'right'});
 box(s,0.78,6.05,3.2,0.48,'提案の核','名刺を“連絡先”ではなく、営業データが発生する接点に変える。',{fill:'0D0F14',headSize:8.5,bodySize:7.4}); box(s,4.38,6.05,3.2,0.48,'説明できる価値','誰に何を届け、次に何をすべきかを可視化する。',{fill:'0D0F14',headSize:8.5,bodySize:7.4}); box(s,7.98,6.05,3.2,0.48,'期待効果','フォロー漏れ削減、商談化率向上、紹介機会の創出。',{fill:'0D0F14',headSize:8.5,bodySize:7.4}); footer(s);}

// 2 Leakage funnel
{const s=pptx.addSlide(); bg(s); title(s,2,'名刺交換の後に、営業機会が漏れている','交換後の体験を設計しない限り、出会いは資産化しない。');
 const xs=[0.9,3.1,5.3,7.5,9.7], widths=[1.8,1.65,1.5,1.35,1.2], labels=['交換','記憶低下','フォロー遅延','関心不明','機会損失'];
 xs.forEach((x,i)=>{s.addShape(pptx.ShapeType.trapezoid,{x,y:3.0+i*0.04,w:widths[i],h:1.2,fill:{color:i===0?C.gold:i<3?C.panel2:C.coral,transparency:i===0?0:10},line:{color:C.line,transparency:20}}); t(s,labels[i],x+0.12,3.38+i*0.04,widths[i]-0.24,0.16,{size:12,bold:true,color:i===0?C.bg:C.ivory,align:'center'}); if(i<4)arrow(s,x+widths[i]+0.12,3.6,xs[i+1]-0.1,3.6,C.muted);});
 box(s,0.85,5.25,3.0,0.95,'課題','交換した名刺が、相手別の次アクションに変換されない。',{fill:'11131A'}); box(s,4.15,5.25,3.0,0.95,'示唆','フォローは「後で送る」では遅い。交換の瞬間に設計する。',{fill:'11131A'}); box(s,7.45,5.25,3.0,0.95,'KATAOMOI','名刺を営業導線の起点に変え、漏れを減らす。',{fill:'11131A',accent:C.coral}); footer(s);}

// 3 Touch to personalized journey
{const s=pptx.addSlide(); bg(s); title(s,3,'KATAOMOI名刺は、相手別の導線をその場で出し分ける','1枚の紙名刺が、相手ごとのパーソナルLPになる。');
 const steps=[['Touch','NFCタッチ'],['Route','相手別URL'],['Present','最適情報'],['Follow','AIフォロー'],['Learn','関係データ化']];
 steps.forEach((st,i)=>{const x=0.75+i*2.45; box(s,x,2.75,1.65,1.0,st[0],st[1],{num:i+1,fill:i===0?'241D10':C.panel}); if(i<steps.length-1)arrow(s,x+1.72,3.25,x+2.35,3.25,C.gold);});
 const destinations=[['営業資料','商談化'],['採用ページ','応募導線'],['予約/EC','即時購入'],['イベントLP','体験記録']]; destinations.forEach((d,i)=>box(s,1.05+i*3.0,4.75,2.35,0.9,d[0],d[1],{fill:'11131A',headColor:i===0?C.softGold:C.teal}));
 t(s,'相手に合わせた情報を、交換の瞬間に届ける',0.9,6.18,7.5,0.3,{size:17,bold:true,color:C.softGold}); footer(s);}

// 4 Relationship graph logic
{const s=pptx.addSlide(); bg(s); title(s,4,'親密度を可視化し、紹介の信頼を説明可能にする','接触回数・AI会話量・対面時間を統合し、関係性を距離と太さで表す。');
 const nodes=[['A',6.3,2.7,0.55,C.gold],['B',8.0,1.7,0.42,C.teal],['C',9.3,3.0,0.36,C.muted],['D',7.55,4.3,0.32,C.coral],['E',10.3,4.4,0.28,C.muted],['F',5.2,4.35,0.27,C.muted]];
 [[0,1,3,C.gold],[0,2,2,C.softGold],[0,3,2.5,C.coral],[0,5,1,C.muted],[2,4,1,C.muted],[3,4,1.4,C.coral]].forEach(([a,b,w,c])=>{const A=nodes[a],B=nodes[b]; s.addShape(pptx.ShapeType.line,{x:A[1]+A[3]/2,y:A[2]+A[3]/2,w:B[1]-A[1],h:B[2]-A[2],line:{color:c,width:w,transparency:10}});});
 nodes.forEach(([label,x,y,r,c])=>{s.addShape(pptx.ShapeType.ellipse,{x,y,w:r,h:r,fill:{color:c,transparency:0},line:{color:C.ivory,width:0.5,transparency:20}}); t(s,label,x,y+r/2-0.03,r,0.08,{size:8,bold:true,color:C.bg,align:'center'});});
 box(s,0.8,2.25,3.9,0.86,'距離','近いほど親密度が高い。紹介の確度を視覚的に判断できる。',{fill:'11131A'}); box(s,0.8,3.42,3.9,0.86,'太さ','接触回数・会話量・対面時間を反映。関係の強さが一目でわかる。',{fill:'11131A'}); box(s,0.8,4.6,3.9,0.86,'証明','紹介者としての信頼度をブロックチェーンで証明する構想。',{fill:'11131A'}); footer(s);}

// 5 SNS comparison
{const s=pptx.addSlide(); bg(s); title(s,5,'SNSの「網」から、関係性の「銛」へ','広く撒くのではなく、出会った相手に刺さる接点を増やす。');
 box(s,0.8,2.1,5.4,3.5,'従来SNS：広く投稿して偶然を待つ','不特定多数に向けて発信。誰に届いたか、関係が深まったかを把握しにくい。',{fill:'11131A',headColor:C.muted,headSize:15,bodySize:12});
 for(let i=0;i<18;i++){const x=1.2+(i%6)*0.72,y=3.55+Math.floor(i/6)*0.42;s.addShape(pptx.ShapeType.ellipse,{x,y,w:0.09,h:0.09,fill:{color:C.muted,transparency:20},line:{transparency:100}})}
 box(s,7.1,2.1,5.4,3.5,'KATAOMOI：特定相手に最適導線を届ける','名刺交換の瞬間に、相手別LP・資料・予約・採用導線へ。AIが継続接点を育てる。',{fill:'17120A',headColor:C.softGold,headSize:15,bodySize:12});
 s.addShape(pptx.ShapeType.ellipse,{x:9.45,y:3.55,w:0.42,h:0.42,fill:{color:C.gold},line:{color:C.ivory,width:0.5}}); ['営業資料','採用','予約','紹介'].forEach((v,i)=>{const x=7.75+i*1.05,y=4.55+(i%2)*0.42; arrow(s,9.65,3.75,x+0.35,y,C.gold); pill(s,v,x,y,0.8,i===1?C.teal:C.gold);}); footer(s);}

// 6 Operating model
{const s=pptx.addSlide(); bg(s); title(s,6,'導入後は、接点が自動で育つ運用へ','カード・LP・AI・業務アプリを連携し、商談後の手作業を減らす。');
 const layers=[['Front','NFC名刺 / イベントカード',1.0],['Experience','相手別LP / 資料 / 予約 / EC',2.25],['Automation','分身AI / メール / CRM / 通知',3.5],['Data','人脈グラフ / 親密度 / 接触履歴',4.75]];
 layers.forEach(([l,b,y],i)=>{box(s,1.0,y,4.2,0.72,l,b,{fill:i%2?'121722':'17120A',headColor:i<2?C.softGold:C.teal,bodySize:10}); if(i<layers.length-1)arrow(s,3.1,y+0.74,3.1,y+1.17,C.gold);});
 s.addShape(pptx.ShapeType.ellipse,{x:7.25,y:2.55,w:2.05,h:2.05,fill:{color:C.gold,transparency:0},line:{color:C.softGold,width:1.2}}); t(s,'営業OS',7.62,3.33,1.3,0.18,{size:20,bold:true,color:C.bg,align:'center'});
 ['営業','採用','PR','紹介'].forEach((v,i)=>{const ang=[[-1.3,-1.0],[1.85,-0.85],[-1.25,1.72],[1.85,1.55]][i]; const x=8.2+ang[0],y=3.55+ang[1]; arrow(s,8.25,3.6,x+0.35,y+0.15,C.softGold); pill(s,v,x,y,0.9,i===1?C.teal:C.gold);});
 box(s,9.72,5.2,2.55,0.92,'次のアクション','まずはKATAOMOI名刺で第一印象を変え、AIアプリで接点運用を自動化する。',{fill:'11131A',headColor:C.softGold}); footer(s);}

await pptx.writeFile({ fileName: out });
console.log(JSON.stringify({ pptx: out, slides: pptx._slides.length }, null, 2));
