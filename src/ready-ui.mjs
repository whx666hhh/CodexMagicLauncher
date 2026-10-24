// Read only viewport and interface colours from the verified renderer. No
// screenshots or chat text; never connect outside the verified loopback.
const [portText, browserId, targetId] = process.argv.slice(2);
const allowHidden=process.argv[5]==='--layout-hidden';
const probeShell=process.argv[5]==='--probe-shell';
const port = Number(portText);
if (!Number.isInteger(port) || port < 1024 || port > 65535 ||
    !/^[A-Za-z0-9._-]{1,200}$/.test(browserId || '') ||
    !/^[A-Za-z0-9._-]{1,200}$/.test(targetId || '')) throw Error('Invalid identity');
function endpoint(raw, type, id) {
  const u = new URL(raw);
  if (u.protocol !== 'ws:' || !['127.0.0.1','localhost','[::1]'].includes(u.hostname) ||
      Number(u.port) !== port || u.username || u.password || u.search || u.hash ||
      u.pathname !== `/devtools/${type}/${id}`) throw Error('Rejected endpoint');
  return u.href;
}
const base = `http://127.0.0.1:${port}`;
const get = async path => (await fetch(base+path,{signal:AbortSignal.timeout(3000)})).json();
endpoint((await get('/json/version')).webSocketDebuggerUrl,'browser',browserId);
const target = (await get('/json/list')).find(t=>t.id===targetId && t.type==='page' && t.url.startsWith('app://'));
if (!target) throw Error('Verified renderer disappeared');
const ws = new WebSocket(endpoint(target.webSocketDebuggerUrl,'page',targetId));
const pending = new Map(); let next = 0;
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Socket timeout')),3000);ws.onopen=()=>{clearTimeout(timer);resolve()};ws.onerror=()=>{clearTimeout(timer);reject(Error('Socket failed'))}});
ws.onmessage=e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
function send(method,params={}) {return new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Capture timeout'))},5000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})}
try {
  if(probeShell){
    // Bounded structural diagnostics only: no text, URLs, input values or pixels.
    const r=await send('Runtime.evaluate',{returnByValue:true,expression:`(() => ({
      ready:document.readyState,hidden:document.hidden,
      width:innerWidth,height:innerHeight,
      rootChildren:document.getElementById('root')?.childElementCount??-1,
      main:!!document.querySelector('main,[role="main"]'),
      sidebar:!!document.querySelector('aside'),
      composer:!!document.querySelector('textarea,[contenteditable="true"],[role="textbox"]'),
      branded:!!document.querySelector('[data-testid="app-shell-header-context-menu-surface"]'),
      emailInput:!!document.querySelector('input[type="email"]'),
      passwordInput:!!document.querySelector('input[type="password"]'),
      skin:!!window.__CODEX_DREAM_SKIN_STATE__
    }))()`});
    const p=r.result?.value;
    if(!p||!Number.isFinite(p.width)||typeof p.main!=='boolean')throw Error('Invalid structural probe');
    process.stdout.write(JSON.stringify(p));
  }else{
  const r=await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
    const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');
    const color=(selector,fallback)=>{const node=document.querySelector(selector);ctx.clearRect(0,0,1,1);ctx.fillStyle=node?getComputedStyle(node).backgroundColor:fallback;ctx.fillRect(0,0,1,1);const p=ctx.getImageData(0,0,1,1).data;return p[3]?'#'+[p[0],p[1],p[2]].map(n=>n.toString(16).padStart(2,'0')).join(''):fallback};
    const edges=[],seen=new Set();
    const selector='aside,main,header,nav,footer,section,form,textarea,input,button,[role="separator"],[role="textbox"],[role="tab"],[role="tablist"],[class*="composer"],[class*="card"],[class*="sidebar"]';
    for(const node of document.querySelectorAll(selector)){
      const r=node.getBoundingClientRect(),style=getComputedStyle(node);
      if(r.width<12||r.height<3||r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1||style.visibility==='hidden'||style.display==='none')continue;
      const box={x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),radius:Math.min(14,parseFloat(style.borderRadius)||0)};
      const key=[box.x,box.y,box.width,box.height].join(',');if(seen.has(key))continue;seen.add(key);edges.push(box);
    }
    edges.sort((a,b)=>b.width*b.height-a.width*a.height);
    return {visible:!document.hidden,ready:document.readyState==='complete',skin:!!window.__CODEX_DREAM_SKIN_STATE__,w:innerWidth,h:innerHeight,deviceScale:devicePixelRatio,edges:edges.slice(0,160),colors:[color('main','#181C22'),color('aside','#202731'),color('.composer-surface-chrome','#3D4754')]};
  })()`});
      const p=r.result?.value;
  if((!allowHidden&&!p?.visible) || !p.ready || !p.skin || p.w<100 || p.h<100) throw Error('Renderer no longer ready');
  process.stdout.write(JSON.stringify({width:p.w,height:p.h,deviceScale:p.deviceScale,edges:p.edges,colors:p.colors}));
  }
} finally {ws.close()}
