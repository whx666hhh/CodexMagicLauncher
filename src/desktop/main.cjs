'use strict';
const{app,BrowserWindow,ipcMain,screen,dialog,globalShortcut,contentTracing}=require('electron');
const{spawn}=require('node:child_process');
const{join,resolve}=require('node:path');
const{mkdirSync,appendFileSync,writeFileSync}=require('node:fs');
const readline=require('node:readline');
const root=resolve(__dirname,'../..'),args=new Set(process.argv.slice(2));
const synthetic=args.has('--synthetic'),reuse=args.has('--reuse-only');
const stateRoot=join(root,'state','desktop');mkdirSync(stateRoot,{recursive:true});app.setPath('userData',join(stateRoot,'browser'));
const feedbackToken=process.argv.find(arg=>/^--launch-feedback=[a-f0-9]{32}$/.test(arg))?.split('=')[1];
let feedbackAcknowledged=false;
let overlay,bridge,backend,target,geometry,verified=false,armed=false,closing=false,lastFrame=0,startTime=0,initializationTimer,readyInfo;
let backendStarted=false,backgroundCovered=false,coverSent=false,coverToken=null,consentPending=false,resumeAfterConsent=false,layoutPending=false;
let restorationTimer,shutdownStarted=false,contentShown=false;
let frameSerial=0,frameInFlight=0,pendingFrame=null;
const metrics={version:app.getVersion(),synthetic,design:'accepted-aurora-v4-adaptive',realScreenImagesSaved:false,realUiCaptured:false};
const captures=new Set();
function log(value){appendFileSync(join(stateRoot,'events.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');}
function command(value){
  if(!bridge||bridge.killed||!bridge.stdin.writable)return;
  if(value.op==='frame'){
    if(frameInFlight){pendingFrame=value;metrics.coalescedNativeFrames=(metrics.coalescedNativeFrames||0)+1;return;}
    frameInFlight=++frameSerial;value={...value,serial:frameInFlight};
  }else if(value.op==='restore')pendingFrame=null;
  bridge.stdin.write(JSON.stringify(value)+'\n');
}
function childJson(child,prefix,onValue){readline.createInterface({input:child.stdout}).on('line',line=>{if(prefix&&!line.startsWith(prefix))return;try{onValue(JSON.parse(line.slice(prefix.length)));}catch(error){fail(error);}});child.stderr.on('data',()=>{});}
async function shutdown(){
  if(shutdownStarted)return;shutdownStarted=true;clearTimeout(restorationTimer);bridge?.stdin.end();backend?.stdin.end();target?.kill();globalShortcut.unregisterAll();
  try{if(synthetic&&args.has('--trace-profile'))await contentTracing.stopRecording(join(stateRoot,'native-profile.json'));}finally{app.exit(['failed','restore-timeout'].includes(metrics.reason)?1:0);}
}
function finish(reason='complete'){
  if(closing)return;closing=true;clearTimeout(initializationTimer);metrics.reason=reason;metrics.elapsed=startTime?Date.now()-startTime:0;metrics.averageFrameRate=metrics.elapsed?Math.round((metrics.frames||0)*100000/metrics.elapsed)/100:0;log({stage:'finish',...metrics});
  if(overlay&&!overlay.isDestroyed())overlay.hide();command({op:'restore',show:reason==='complete'});
  if(!bridge||!armed){shutdown();return;}
  // The recovery acknowledgement owns shutdown. A fixed delay can kill the
  // synthetic target or desktop host before the native reply is consumed.
  restorationTimer=setTimeout(()=>{metrics.reason='restore-timeout';log({stage:'restore-timeout',restored:false});shutdown();},5000);
}
function fail(error){if(closing)return;log({stage:'failed',message:String(error.message||error)});finish('failed');if(!args.has('--diagnostic'))dialog.showErrorBox('魔法启动已退出',String(error.message||error));}
function validateTarget(){if(readyInfo&&geometry?.pid&&!readyInfo.pids?.includes(geometry.pid))throw Error('皮肤验证窗口与动画目标不一致。');}
function attachTarget(){
  if(synthetic){command({op:'attach'});return;}
  if(!readyInfo?.pids?.length||!readyInfo.pids.every(p=>Number.isInteger(p)&&p>0)||!['width','height','deviceScale'].every(k=>Number.isFinite(readyInfo[k])&&readyInfo[k]>0))throw Error('已验证窗口身份不完整。');
  command({op:'attach',pids:readyInfo.pids,width:Math.round(readyInfo.width*readyInfo.deviceScale),height:Math.round(readyInfo.height*readyInfo.deviceScale)});
}
function syntheticLayout(){const width=geometry.client.width/geometry.scale,height=geometry.client.height/geometry.scale;return{width,height,deviceScale:geometry.scale,edges:[{x:0,y:0,width:220,height},{x:220,y:0,width:width-220,height:52},{x:245,y:80,width:width-280,height:height-240},{x:245,y:height-130,width:width-280,height:95,radius:12}]};}
function publishLayout(value){
  geometry.layout=value;metrics.edgeCount=value.edges.length;
  overlay?.webContents.send('magic-layout',{...value,geometry:{screen:geometry.screen,client:geometry.client,outer:geometry.outer}});
  if(verified)overlay?.webContents.send('magic-ready');
}
function refreshLayout(){
  if(layoutPending||!readyInfo||!geometry?.pid||closing)return;validateTarget();layoutPending=true;
  const reader=readyInfo.layoutReader;if(!reader)throw Error('真实布局读取器不可用。');
  const child=spawn(reader.node,[join(root,'src','ready-ui.mjs'),String(reader.port),reader.browser,reader.target,'--layout-hidden'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let received=false;
  const timeout=setTimeout(()=>{child.kill();if(!closing)fail(Error('小窗布局读取超时。'));},8000);
  childJson(child,'',value=>{
    if(!Number.isFinite(value.width)||!Number.isFinite(value.height)||!Number.isFinite(value.deviceScale)||value.deviceScale<=0||!Array.isArray(value.edges)||!value.edges.length||value.edges.length>160||!value.edges.every(r=>['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=value.width+2&&r.y+r.height<=value.height+2))throw Error('真实窗口轮廓不可用。');
    if(Math.abs(value.width*value.deviceScale-geometry.client.width)>4||Math.abs(value.height*value.deviceScale-geometry.client.height)>4)throw Error('真实布局与小窗尺寸不一致。');
    received=true;verified=true;publishLayout(value);log({stage:'layout-ready',edges:value.edges.length});
  });child.on('error',fail);child.on('exit',()=>{clearTimeout(timeout);layoutPending=false;if(!closing&&!received)fail(Error('真实布局读取失败。'));});
}
async function makeOverlay(){
  if(!geometry||overlay||closing)return;
  const bounds=screen.screenToDipRect(null,geometry.screen),display=screen.getDisplayMatching(bounds);
  geometry={...geometry,scale:display.scaleFactor,bounds,ready:false,synthetic,profile:args.has('--diagnostic'),profileOmit:synthetic&&args.has('--diagnostic')?['array','galaxy','outer','window','relics','bloom','veils'].filter(k=>args.has('--profile-omit-'+k)):[]};metrics.profileOmit=geometry.profileOmit;
  geometry.liveRing=synthetic&&args.has('--live-ring');geometry.liveRelics=synthetic&&args.has('--live-relics');metrics.retainedRings=!geometry.liveRing;metrics.retainedRelics=!geometry.liveRelics;
  const gpu=app.getGPUFeatureStatus();metrics.gpu={compositing:gpu.gpu_compositing,rasterization:gpu.rasterization};
  const win=new BrowserWindow({...bounds,show:false,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,hasShadow:false,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,devTools:false}});overlay=win;
  win.setIgnoreMouseEvents(true,{forward:true});win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>callback({cancel:!details.url.startsWith('file://')}));
  win.webContents.on('render-process-gone',()=>{if(overlay===win)fail(Error('动画进程退出，已恢复原窗口。'));});
  win.webContents.on('did-fail-load',(_event,code)=>{if(code!==-3&&overlay===win)fail(Error('动画文件加载失败。'));});
  win.on('closed',()=>{if(overlay===win)finish('closed');});
  initializationTimer=setTimeout(()=>fail(Error('动画初始化超时，已保留原窗口。')),15000);
  await win.loadFile(join(root,'animation','accepted-aurora-v4','index.html'));
}
function startBridge(syntheticPid,syntheticHwnd){
  frameInFlight=0;pendingFrame=null;
  geometry=null;verified=synthetic&&!args.has('--delay-test');backgroundCovered=false;coverSent=false;layoutPending=false;contentShown=false;
  const child=spawn(join(root,'NativeBridge.exe'),['--state-dir',stateRoot,'--desktop-first',...(syntheticPid?['--synthetic-pid',String(syntheticPid),'--synthetic-hwnd',String(syntheticHwnd)]:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']});bridge=child;
  childJson(child,'',value=>{
    if(value.stage==='geometry'){geometry=value;log({stage:'geometry',synthetic:value.synthetic,screen:value.screen,client:value.client,provisional:true});makeOverlay().catch(fail);}
    else if(value.stage==='target-geometry'){
      geometry={...geometry,...value};validateTarget();log({stage:'target-attached',client:value.client});
      if(synthetic)publishLayout(syntheticLayout());else refreshLayout();
    }else if(value.stage==='armed'){
      clearTimeout(initializationTimer);armed=true;overlay.showInactive();startTime=Date.now();metrics.frames=0;globalShortcut.register('Escape',()=>finish('cancelled'));overlay.webContents.send('magic-start');log({stage:'visible',backendAlreadyStarted:backendStarted});
      if(feedbackToken&&!feedbackAcknowledged){feedbackAcknowledged=true;writeFileSync(join(stateRoot,'launch-feedback-'+feedbackToken+'.ready'),'visible');}
      if(synthetic){command({op:'attach'});if(args.has('--cancel-test'))setTimeout(()=>finish('cancelled'),4000).unref();if(!verified)setTimeout(()=>{if(!closing){verified=true;overlay?.webContents.send('magic-ready');}},55000).unref();}
      else if(readyInfo){attachTarget();}else startBackend();
    }else if(value.stage==='frame-applied'){
      if(value.serial===frameInFlight){frameInFlight=0;const next=pendingFrame;pendingFrame=null;if(next&&!closing&&!consentPending)command(next);}
    }else if(value.stage==='pointer'){overlay?.webContents.send('magic-pointer',{x:value.x,y:value.y});}
    else if(value.stage==='restored'){metrics.restored=true;log({stage:'restored',restored:true});if(closing)shutdown();}
    else if(value.stage==='cancelled')finish('cancelled');else if(value.stage==='failed')fail(Error(value.message));
  });child.on('error',fail);child.on('exit',()=>{
    if(bridge!==child)return;bridge=null;
    if(consentPending){if(resumeAfterConsent){consentPending=false;resumeAfterConsent=false;startBridge();}return;}
    if(!closing)fail(Error('窗口接入未完成，已交回真实窗口。'));
  });
}
function sendCover(){if(coverToken&&backgroundCovered&&!coverSent&&backend?.stdin.writable){coverSent=true;log({stage:'cover-ready'});backend.stdin.write('covered:'+coverToken+'\n');}}
function startBackend(){
  if(backendStarted)return;backendStarted=true;let received=false;
  const ps=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  backend=spawn(ps,['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',join(root,'src','backend.ps1'),'-WaitForCover',...(reuse?['-ReuseOnly']:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']});sendCover();
  childJson(backend,'@MAGIC ',value=>{
    if(closing)return;
    log({stage:'backend-'+value.stage,verified:value.verified===true,elapsed:value.elapsed,engineVersion:value.engineVersion,category:value.category});
    if(value.stage==='ready'){
      if(value.verified!==true)return fail(Error('皮肤尚未通过验证。'));received=true;readyInfo=value;
      if(consentPending)return fail(Error('加载动画尚未恢复，已停止窗口交接。'));
      validateTarget();attachTarget();
    }else if(value.stage==='cancelled')finish('cancelled');
    else if(['failed','not-ready'].includes(value.stage))fail(Error(value.message||'当前窗口或皮肤尚未通过验证。'));
    else if(value.stage==='working'){
      if(!/^[a-f0-9]{32}$/.test(value.coverToken||''))return fail(Error('启动覆盖确认无效。'));
      coverToken=value.coverToken;coverSent=false;sendCover();
    }else if(value.stage==='consent-approved'){
      if(!consentPending)return fail(Error('重启确认状态无效。'));
      if(bridge)resumeAfterConsent=true;else{consentPending=false;startBridge();}
    }
    else if(value.stage==='consent'){
      consentPending=true;resumeAfterConsent=false;armed=false;backgroundCovered=false;coverSent=false;coverToken=null;clearTimeout(initializationTimer);globalShortcut.unregisterAll();command({op:'restore'});
      const previous=overlay;overlay=null;previous?.hide();previous?.destroy();
    }
  });backend.on('error',fail);backend.on('exit',()=>{if(!closing&&!received)fail(Error('Codex 或皮肤验证未完成。'));});
}
ipcMain.on('magic-config',event=>{event.returnValue=overlay&&event.sender===overlay.webContents?geometry:null;});
ipcMain.on('magic-rendered',event=>{if(overlay&&event.sender===overlay.webContents)command({op:'arm'});});
ipcMain.on('magic-failed',(event,message)=>{if(overlay&&event.sender===overlay.webContents){log({stage:'renderer-failed',message:String(message||'').slice(0,200)});fail(Error('动效初始化失败，已恢复真实窗口。'));}});
ipcMain.on('magic-frame',(event,value)=>{
  if(!overlay||event.sender!==overlay.webContents||!armed||closing)return;
  if(!value||!Number.isFinite(value.fill)||value.fill<0||value.fill>1||!Number.isFinite(value.opacity)||value.opacity<0||value.opacity>1||!Number.isFinite(value.time)||value.time<0||value.time>260||!Array.isArray(value.icons)||value.icons.length!==geometry.icons.length||!value.icons.every(n=>Number.isFinite(n)&&n>=0&&n<=1))return fail(Error('动画控制状态无效。'));
  if(value.windowProgress>0&&(!verified||value.wholeArrayComplete!==true||value.activation<.999))return fail(Error('完整法阵或真实窗口尚未就绪。'));
  if(value.fill>0&&!verified)return fail(Error('窗口尚未就绪，已停止交接。'));
  if(value.opacity>0&&value.contoursComplete!==true)return fail(Error('内部轮廓尚未构筑完成。'));
  if(value.opacity>0&&!contentShown){contentShown=true;log({stage:'first-content',skinVerified:verified,contoursComplete:value.contoursComplete,targetPid:geometry.pid});}
  if(value.coverage>=1){backgroundCovered=true;sendCover();}
  const now=Date.now();if(now-lastFrame>30||value.done){lastFrame=now;command({op:'frame',fill:value.fill,opacity:value.opacity,time:value.time,icons:value.icons});}
  metrics.waiting=metrics.waiting||value.waiting;metrics.lastTime=value.time;metrics.frames=(metrics.frames||0)+1;metrics.edgeCount=value.contourCount;metrics.lastPhase=value.phase;
  if(synthetic&&args.has('--capture-test'))for(const at of [1,6.5,11.4,18,23,27.2,31.9])if(value.time>=at&&!captures.has(at)){captures.add(at);overlay.webContents.capturePage().then(image=>writeFileSync(join(stateRoot,`synthetic-v12-${at}s.png`),image.toPNG())).catch(()=>{});}
  if(value.done){metrics.sequence=value.sequence;if(args.has('--diagnostic')&&value.profile){const p=value.profile;metrics.renderer={engine:['webgl','canvas'].includes(p.engine)?p.engine:'unknown',renderer:String(p.renderer||'').slice(0,200)};for(const group of ['render','phases']){metrics.renderer[group]={};for(const [key,v]of Object.entries(p[group]||{}).slice(0,20))if(/^[a-z]{1,20}$/.test(key)&&['samples','mean','p95'].every(k=>Number.isFinite(v[k])&&v[k]>=0))metrics.renderer[group][key]=v;}}metrics.gpu=app.getGPUFeatureStatus();finish();}
});
if(!app.requestSingleInstanceLock())app.quit();else app.whenReady().then(async()=>{
  if(synthetic&&args.has('--trace-profile'))await contentTracing.startRecording({included_categories:['devtools.timeline','disabled-by-default-devtools.timeline','cc','gpu','viz','toplevel'],excluded_categories:['disabled-by-default-devtools.screenshot']});
  if(synthetic){target=spawn(join(root,'NativeBridge.exe'),['--test-target',...(args.has('--fullscreen-test')?['--maximized']:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']});childJson(target,'',value=>{if(value.stage==='test-target')startBridge(value.pid,value.hwnd);});}
  else startBridge();
}).catch(fail);
app.on('window-all-closed',()=>{if(!closing&&!consentPending)finish('closed');});
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
