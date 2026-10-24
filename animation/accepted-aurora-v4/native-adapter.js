(() => {
  'use strict';
  const native=window.codexMagic,config=native?.config,root=document.getElementById('aurora-universe-g-v4');
  if(!native||!config||!root?.__array)throw Error('Native v12 initialization failed');
  const api=root.__array,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const sequence=window.__nativeSequence;
  if(!sequence)throw Error('Native sequence unavailable');
  let ready=false,layout=false,began=null,clock=null,stopped=false,last=0;
  window.__nativeTiming={ambient:0,motionOffset:0};
  window.__nativeFrameProfile={};let previousFrame=null;
  window.__nativeGeometry=config;
  native.layout(value=>{
    window.__nativeGeometry={...config,...value.geometry};layout=true;
    api.prewarm();
    if(ready&&clock)clock.ready((performance.now()-began)/1000);
  });
  native.ready(()=>{ready=true;if(layout&&clock)clock.ready((performance.now()-began)/1000);});
  function frame(now){
    if(stopped)return;
    if(last&&now-last<32){requestAnimationFrame(frame);return;}last=now;
    try{
      const cpuStart=performance.now();
      const wall=Math.max(clock.now,(performance.now()-began)/1000);if(wall>240)throw Error('Codex readiness timeout');
      const f=clock.frame(wall);window.__nativeTiming={ambient:wall*(window.__auroraReducedMotion ? .12 : 1),motionOffset:f.motionOffset*(window.__auroraReducedMotion ? .12 : 1)};
      if(config.profile&&previousFrame!==null){const key=f.time<2.4?'rfentry':f.time<sequence.ringAt?'rfbuild':f.time<sequence.releaseAt?'rfring':'rfexit',a=window.__nativeFrameProfile[key]??=[];if(a.length<5000)a.push(now-previousFrame);}previousFrame=now;
      const s=api.seek(f.time,true),interior=s.restoredWindow.interior;
      const contoursComplete=layout&&interior.count>0&&interior.complete===interior.count;
      const content=ready&&layout&&contoursComplete?smooth((f.time-sequence.contentAt)/.70):0;
      const target=window.__nativeGeometry.client,screen=window.__nativeGeometry.screen;
      const rect={x:target.x-screen.x,y:target.y-screen.y,width:target.width,height:target.height};
      const canvas=root.querySelector('[data-array]'),ctx=canvas.getContext('2d');
      if(content>0){
        const pixelScale=canvas.width/screen.width;ctx.save();ctx.resetTransform();ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=content;ctx.fillRect(rect.x*pixelScale,rect.y*pixelScale,rect.width*pixelScale,rect.height*pixelScale);ctx.restore();
      }
      const css=1/config.scale;
      const cut=content>0?`path(evenodd, 'M0 0H${screen.width*css}V${screen.height*css}H0Z M${rect.x*css} ${rect.y*css}v${rect.height*css}h${rect.width*css}v-${rect.height*css}Z')`:'';
      for(const layer of root.querySelectorAll('canvas:not([data-array])'))layer.style.clipPath=cut;
      const svg=document.getElementById('formation-svg');if(content>0)svg.style.opacity=String(1-content);
      const raw=s.iconGalaxy.iconAmounts||[],icons=config.icons.map((_,i)=>raw[i]??1);
      const activation=s.activationProgress,windowProgress=f.time>=clock.windowAt?clamp(s.restoredWindow.edge):0;
      const phase=f.waiting?'waiting':f.time<2.4?'entry':f.time<clock.windowAt?'construction':f.time<sequence.contentAt?'contours':f.time<sequence.releaseAt?'handoff':f.time<sequence.releaseAt+3.2?'retirement':'return';
      native.frame({time:f.time,fill:content>0?1:0,opacity:content,icons,contoursComplete,contourCount:interior.count,windowProgress,wholeArrayComplete:s.constructionComplete,activation,coverage:f.time>=2.2?1:0,waiting:f.waiting,phase,done:f.done,profile:f.done&&config.profile?window.__nativeProfile():undefined,sequence:{referenceDuration:sequence.duration,adaptive:true,readyAt:clock.readyAt,wallDuration:wall,windowAt:clock.windowAt,rate:f.rate}});
      if(config.profile){const a=window.__nativeFrameProfile[f.time>=sequence.ringAt&&f.time<sequence.releaseAt?'cpuring':'cpuother']??=[];if(a.length<5000)a.push(performance.now()-cpuStart);}
      if(f.done){stopped=true;return;}requestAnimationFrame(frame);
    }catch(error){stopped=true;native.failed(error.message);}
  }
  native.start(()=>{
    const stats=JSON.parse(root.dataset.stats),windowAt=2.4+stats.constructionLead+stats.restoredWindow.windowStart;
    clock=new window.AdaptiveLaunchClock({windowAt,contentAt:sequence.contentAt,releaseAt:sequence.releaseAt,duration:sequence.duration,stagedUntil:sequence.stagedUntil});began=performance.now();if(ready&&layout)clock.ready(0);requestAnimationFrame(frame);
  });
  api.seek(0);api.prewarm();window.__nativeSpritesReady.then(()=>native.rendered(),()=>native.failed('法器材质资源加载失败。'));
})();
