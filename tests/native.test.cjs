'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {join}=require('node:path');
const {mkdirSync,readdirSync}=require('node:fs');
const readline=require('node:readline');
const root=join(__dirname,'..'),exe=join(root,'NativeBridge.exe'),state=join(root,'state','guard-test');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('native selection binds the verified viewport and rejects ambiguous shells',{skip:process.platform!=='win32'},()=>{
  mkdirSync(state,{recursive:true});const framework=join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319'),wpf=join(framework,'WPF'),testExe=join(state,'WindowSelectionTest.exe');
  execFileSync(join(framework,'csc.exe'),['/nologo','/codepage:65001','/target:exe','/out:'+testExe,'/reference:'+join(wpf,'WindowsBase.dll'),'/reference:'+join(wpf,'UIAutomationClient.dll'),'/reference:'+join(wpf,'UIAutomationTypes.dll'),'/reference:'+join(framework,'Accessibility.dll'),'/reference:System.Drawing.dll',join(root,'src/native/Native.cs'),join(__dirname,'WindowSelection.cs')],{windowsHide:true});
  assert.match(execFileSync(testExe,[],{windowsHide:true,encoding:'utf8'}),/PASS:/);
});
function lines(child){
  const pending=[],queue=[];
  readline.createInterface({input:child.stdout}).on('line',line=>{
    const value=JSON.parse(line.replace(/^\uFEFF/,''));if(value.stage==='pointer')return;if(pending.length)pending.shift()(value);else queue.push(value);
  });
  return()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Native response timeout')),5000);
    pending.push(value=>{clearTimeout(timeout);resolve(value);});
  });
}
test('independent guard restores the original region after the bridge is killed',{skip:process.platform!=='win32',timeout:20000},async()=>{
  mkdirSync(state,{recursive:true});
  const target=spawn(exe,['--test-target'],{windowsHide:true});let bridge;
  try{
    const info=await lines(target)();assert.equal(info.stage,'test-target');
    const args=['--synthetic-pid',String(info.pid),'--synthetic-hwnd',String(info.hwnd),'--state-dir',state];
    const inspect=()=>JSON.parse(execFileSync(exe,[...args,'--inspect'],{encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,''));
    const original=inspect();bridge=spawn(exe,args,{windowsHide:true});const next=lines(bridge);
    assert.equal((await next()).stage,'geometry');bridge.stdin.write('{"op":"arm"}\n');assert.equal((await next()).stage,'armed');
    assert.equal(inspect().targetVisible,false);
    assert.notDeepEqual(inspect().region,original.region);assert.equal(readdirSync(state).filter(n=>n.startsWith('recovery-')).length,1);
    bridge.stdin.write('{"op":"frame","fill":1,"opacity":0.5,"time":14.1}\n');
    await pause(150);assert.equal(inspect().alpha,128);
    bridge.kill();
    for(let i=0;i<50&&readdirSync(state).some(n=>n.startsWith('recovery-'));i++)await pause(100);
    assert.deepEqual(inspect(),original);assert.equal(readdirSync(state).filter(n=>n.startsWith('recovery-')).length,0);
  }finally{bridge?.kill();target.kill();}
});
for(const attach of [false,true])test(`desktop-first guard restores after failure ${attach?'after':'before'} target attachment`,{skip:process.platform!=='win32',timeout:20000},async()=>{
  mkdirSync(state,{recursive:true});const target=spawn(exe,['--test-target'],{windowsHide:true});let bridge;
  try{
    const info=await lines(target)(),base=['--synthetic-pid',String(info.pid),'--synthetic-hwnd',String(info.hwnd),'--state-dir',state];
    const inspect=()=>JSON.parse(execFileSync(exe,[...base,'--inspect'],{encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,''));const original=inspect();
    bridge=spawn(exe,[...base,'--desktop-first'],{windowsHide:true});const next=lines(bridge);const provisional=await next();assert.equal(provisional.pid,0);assert.equal(provisional.provisional,true);
    bridge.stdin.write('{"op":"arm"}\n');assert.equal((await next()).stage,'armed');assert.deepEqual(inspect(),original);
    if(attach){bridge.stdin.write('{"op":"attach"}\n');assert.equal((await next()).stage,'target-geometry');assert.equal(inspect().targetVisible,false);assert.equal(readdirSync(state).filter(n=>n.startsWith('recovery-')).length,1);bridge.stdin.write('{"op":"frame","fill":1,"opacity":0.5,"time":10,"icons":[]}\n');await pause(100);assert.equal(inspect().alpha,128);}
    bridge.kill();for(let i=0;i<60&&readdirSync(state).some(n=>n.startsWith('recovery-'));i++)await pause(100);
    assert.deepEqual(inspect(),original);assert.equal(readdirSync(state).filter(n=>n.startsWith('recovery-')).length,0);
  }finally{bridge?.kill();target.kill();}
});
test('native failure acknowledges successful restoration before exiting',{skip:process.platform!=='win32',timeout:15000},async()=>{
  mkdirSync(state,{recursive:true});const target=spawn(exe,['--test-target'],{windowsHide:true});let bridge;
  try{
    const info=await lines(target)();bridge=spawn(exe,['--synthetic-pid',String(info.pid),'--synthetic-hwnd',String(info.hwnd),'--state-dir',state,'--desktop-first'],{windowsHide:true});
    const next=lines(bridge);assert.equal((await next()).stage,'geometry');bridge.stdin.write('{"op":"arm"}\n');assert.equal((await next()).stage,'armed');
    bridge.stdin.write('{"op":"invalid"}\n');assert.equal((await next()).stage,'failed');assert.equal((await next()).stage,'restored');
    assert.equal(readdirSync(state).filter(n=>n.startsWith('recovery-')).length,0);
  }finally{bridge?.kill();target.kill();}
});
