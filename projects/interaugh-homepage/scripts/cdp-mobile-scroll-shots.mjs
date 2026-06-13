const target = await fetch('http://127.0.0.1:18800/json/new?about:blank', {method:'PUT'}).then(r=>r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id=0; const pending=new Map();
ws.addEventListener('message', ev=>{const msg=JSON.parse(ev.data); if(msg.id&&pending.has(msg.id)){pending.get(msg.id)(msg); pending.delete(msg.id);}});
await new Promise((res,rej)=>{ws.addEventListener('open',res); ws.addEventListener('error',rej);});
function send(method, params={}){return new Promise(resolve=>{const mid=++id; pending.set(mid,resolve); ws.send(JSON.stringify({id:mid,method,params}));});}
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {width:390,height:1200,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url:'http://localhost:3000'}); await new Promise(r=>setTimeout(r,1500));
const fs = await import('node:fs');
for (let i=0;i<8;i++){
  const y = i*2600;
  await send('Runtime.evaluate',{expression:`window.scrollTo(0,${y}); document.querySelectorAll('.fade-in').forEach(e=>e.classList.add('in'))`});
  await new Promise(r=>setTimeout(r,350));
  const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
  fs.writeFileSync(`/Users/umi/.openclaw/workspace/qa-reports/interaugh/mobile-390-scroll-${i+1}.png`, Buffer.from(shot.result.data,'base64'));
}
await fetch('http://127.0.0.1:18800/json/close/'+target.id); ws.close();
