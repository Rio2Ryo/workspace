const targets = await fetch('http://127.0.0.1:18800/json/new?http://localhost:3000', {method:'PUT'}).then(r=>r.json());
const ws = new WebSocket(targets.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
function send(method, params={}) { return new Promise(resolve => { const mid=++id; pending.set(mid, resolve); ws.send(JSON.stringify({id:mid, method, params})); }); }
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {width:390, height:1200, deviceScaleFactor:2, mobile:true});
await send('Page.navigate', {url:'http://localhost:3000'});
await new Promise(r=>setTimeout(r,2000));
const expr = `(() => {
  const vw = document.documentElement.clientWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const els = [...document.querySelectorAll('*')].map(el => {
    const r = el.getBoundingClientRect();
    return {tag: el.tagName.toLowerCase(), cls: el.className && String(el.className).slice(0,120), id: el.id, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width)};
  }).filter(x => x.width > 0 && (x.right > vw + 1 || x.left < -1)).sort((a,b)=> Math.max(b.right-vw, -b.left)-Math.max(a.right-vw, -a.left)).slice(0,30);
  return {vw, sw, overflow: sw-vw, offenders: els};
})()`;
const res = await send('Runtime.evaluate', {expression: expr, returnByValue:true});
console.log(JSON.stringify(res.result.result.value, null, 2));
await fetch('http://127.0.0.1:18800/json/close/'+targets.id);
ws.close();
