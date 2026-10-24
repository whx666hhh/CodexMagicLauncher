'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
function harness(){
  const ipcMain=new EventEmitter(),children=[],windows=[],logs=[],timers=[],files=[];
  function child(file,args){const c=new EventEmitter();Object.assign(c,{file,args,stdout:new PassThrough(),stderr:new PassThrough(),killed:false,writes:[],stdin:{writable:true,write(s){c.writes.push(s)},end(){}},kill(){c.killed=true}});children.push(c);return c;}
  class Window extends EventEmitter{
    constructor(){super();this.destroyed=false;this.shown=false;this.webContents=new EventEmitter();Object.assign(this.webContents,{send(){},setWindowOpenHandler(){},session:{setPermissionRequestHandler(){},webRequest:{onBeforeRequest(){}}}});windows.push(this)}
    loadFile(){return Promise.resolve()}setIgnoreMouseEvents(){}setMenu(){}showInactive(){this.shown=true}hide(){this.shown=false}destroy(){this.destroyed=true}isDestroyed(){return this.destroyed}
  }
  const app=new EventEmitter();Object.assign(app,{getVersion:()=> 'test',setPath(){},requestSingleInstanceLock:()=>false,quit(){},exit(){},getGPUFeatureStatus:()=>({})});
  const mockElectron={app,BrowserWindow:Window,ipcMain,screen:{screenToDipRect:(_w,r)=>r,getDisplayMatching:()=>({scaleFactor:1.25})},dialog:{showErrorBox(){throw Error('Unexpected error box')}},globalShortcut:{register(){},unregisterAll(){}},contentTracing:{}};
  const proc=new EventEmitter();Object.assign(proc,{argv:['node','main','--launch-feedback='+'c'.repeat(32)],env:{SystemRoot:'C:/Windows'}});
  const context=vm.createContext({require(name){if(name==='electron')return mockElectron;if(name==='node:child_process')return{spawn:child};if(name==='node:fs')return{mkdirSync(){},appendFileSync(_p,s){logs.push(JSON.parse(s))},writeFileSync(p){files.push(p)}};return require(name)},__dirname:path.resolve(__dirname,'../src/desktop'),process:proc,console,setTimeout(){const t={unref(){}};timers.push(t);return t},clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/desktop/main.cjs'),'utf8')+'\nglobalThis.hooks={startBridge,finish,command};',context);
  const emit=(c,value)=>c.stdout.write(JSON.stringify(value)+'\n');
  const backendEmit=(c,value)=>c.stdout.write('@MAGIC '+JSON.stringify(value)+'\n');
  const geometry={stage:'geometry',pid:0,screen:{x:0,y:0,width:1920,height:1200},client:{x:410,y:80,width:1100,height:740},icons:[],synthetic:false};
  function coverage(w){ipcMain.emit('magic-frame',{sender:w.webContents},{fill:0,opacity:0,time:3,icons:[],coverage:1,waiting:true,windowProgress:0})}
  return{children,windows,logs,files,emit,backendEmit,geometry,coverage,context};
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('slow native bridge receives the latest frame and restoration bypasses pending frames',()=>{
  const h=harness();h.context.hooks.startBridge();const bridge=h.children[0];
  for(let time=0;time<20;time++)h.context.hooks.command({op:'frame',time});
  assert.equal(bridge.writes.length,1);const first=JSON.parse(bridge.writes[0]);
  h.emit(bridge,{stage:'frame-applied',serial:first.serial});
  assert.equal(bridge.writes.length,2);const next=JSON.parse(bridge.writes[1]);assert.equal(next.time,19);
  h.context.hooks.command({op:'frame',time:20});h.context.hooks.finish('cancelled');
  assert.equal(JSON.parse(bridge.writes.at(-1)).op,'restore');
  const count=bridge.writes.length;h.emit(bridge,{stage:'frame-applied',serial:next.serial});assert.equal(bridge.writes.length,count);
});
test('cold launch waits for this request’s cover acknowledgement',async()=>{
  const h=harness();h.context.hooks.startBridge();const bridge=h.children[0];h.emit(bridge,h.geometry);await turn();h.emit(bridge,{stage:'armed'});const backend=h.children[1],token='a'.repeat(32);
  h.coverage(h.windows[0]);assert.deepEqual(backend.writes,[],'No unsolicited acknowledgement may accumulate');
  h.backendEmit(backend,{stage:'working',coverToken:token});assert.deepEqual(backend.writes,['covered:'+token+'\n']);
  assert(!bridge.writes.some(s=>s.includes('attach')),'Unverified skin must not attach the target');
  h.backendEmit(backend,{stage:'ready',verified:true,pids:[123],width:1536,height:912,deviceScale:1.25});
  assert.deepEqual(JSON.parse(bridge.writes.find(s=>s.includes('attach'))),{op:'attach',pids:[123],width:1920,height:1140});
});
test('restart consent replaces the overlay before authorizing skin startup',async()=>{
  const h=harness();h.context.hooks.startBridge();const oldBridge=h.children[0];h.emit(oldBridge,h.geometry);await turn();h.emit(oldBridge,{stage:'armed'});const backend=h.children[1],oldWindow=h.windows[0],token='b'.repeat(32);
  h.coverage(oldWindow);h.backendEmit(backend,{stage:'consent'});assert(oldWindow.destroyed);assert(oldBridge.writes.some(s=>s.includes('restore')));
  h.backendEmit(backend,{stage:'consent-approved'});h.backendEmit(backend,{stage:'working',coverToken:token});assert.deepEqual(backend.writes,[]);
  oldBridge.emit('exit');const newBridge=h.children[2];h.emit(newBridge,h.geometry);await turn();h.emit(newBridge,{stage:'armed'});
  h.coverage(oldWindow);assert.deepEqual(backend.writes,[],'The pre-consent renderer cannot authorize the new launch');
  assert(h.windows[1].shown);h.coverage(h.windows[1]);assert.deepEqual(backend.writes,['covered:'+token+'\n']);
  assert.equal(h.files.length,1,'Replacing the overlay must not recreate an acknowledgement after the cue has exited');
  assert(!newBridge.writes.some(s=>s.includes('attach')));h.backendEmit(backend,{stage:'ready',verified:true,pids:[123],width:1536,height:912,deviceScale:1.25});assert(newBridge.writes.some(s=>s.includes('attach')));
});
test('declining restart ends the launch without starting another bridge',async()=>{
  const h=harness();h.context.hooks.startBridge();const bridge=h.children[0];h.emit(bridge,h.geometry);await turn();h.emit(bridge,{stage:'armed'});const backend=h.children[1];h.backendEmit(backend,{stage:'consent'});h.backendEmit(backend,{stage:'cancelled'});
  assert.equal(h.children.length,2);assert(h.logs.some(l=>l.stage==='finish'&&l.reason==='cancelled'));assert.deepEqual(backend.writes,[]);
});
