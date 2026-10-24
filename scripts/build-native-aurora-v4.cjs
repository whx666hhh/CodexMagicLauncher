'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),src=path.join(root,'design-drafts/aurora-universe-g-v4'),out=path.join(root,'animation/accepted-aurora-v4');
const read=p=>fs.readFileSync(p,'utf8').replace(/\r/g,''),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
fs.mkdirSync(path.join(out,'assets'),{recursive:true});
const original=read(path.join(src,'renderer.js'));let renderer=original;
function change(a,b){assert(renderer.includes(a),'Missing accepted v4 boundary: '+a.slice(0,100));renderer=renderer.replace(a,b);}
change('window.__nativeTiming={ambient:sceneTime,motionOffset:0};','');
change('viewportWidth=1280;viewportHeight=760;','const viewport=root.getBoundingClientRect();viewportWidth=viewport.width;viewportHeight=viewport.height;');
change('atmosphere.window(ctx,w,h,sceneTime,lifecycle.timing.readyAt);','/* Actual content is revealed by the guard-backed host. */');
change('readyIsSimulated:true','readyIsSimulated:false');
// Profiling must use real elapsed time, not the paused construction playhead.
change('const now=sceneTime*1000;','const now=performance.now();');
change('const start=sceneTime*1000;','const start=performance.now();');
change('a.push(sceneTime*1000-start);','a.push(performance.now()-start);');
change('const activationCache=new Map();','const activationCache=new WeakMap();');
change(`    const key=p.complete&&p.activationKey?p.activationKey:p.kind+'|'+p.width+'|'+p.points.map(q=>q.join(',')).join(';');
    if(!activationCache.has(key))activationCache.set(key,activationSegments(p));
    return activationCache.get(key);`, `    let cache=activationCache.get(p.points);if(!cache){cache=new Map();activationCache.set(p.points,cache);}
    const key=p.kind+'|'+p.width;
    if(!cache.has(key))cache.set(key,activationSegments(p));
    return cache.get(key);`);
change('const nativeCompletePaths=new WeakMap();',`const nativeCompletePaths=new WeakMap(),nativePathCenters=new WeakMap();
  function nativePathCenter(points){let center=nativePathCenters.get(points);if(!center){center=[0,0,0];for(const p of points)for(let k=0;k<3;k++)center[k]+=p[k]/points.length;nativePathCenters.set(points,center);}return center;}`);
change('p.points.reduce((s,v)=>s+project(v,transforms[layerFor(p.kind)])[2],0)/p.points.length','project(nativePathCenter(p.points),transforms[layerFor(p.kind)])[2]');
change('for(const run of runs)rawStroke(ctx,run.points.map(screen),coreWidth,colors.core,alpha*run.alpha);',
  "if(!nativeStrokeRecord&&!nativeActiveGlow)window.strokeCoreBatch(ctx,runs,screen,coreWidth,colors.core,alpha*scenePaintAlpha);else for(const run of runs)rawStroke(ctx,run.points.map(screen),coreWidth,colors.core,alpha*run.alpha);");
// Keep the accepted preview intact; these are the requested native waiting refinements.
change("function paintRelic(ctx,m,center,unit,alpha,energy,detail=false)",`function nativeRelicCenter(m){
  const center=screenWith([...m.center,m.z],'ports');
  if(!window.__auroraReducedMotion)center[1]+=Math.sin((window.__nativeTiming?.ambient??sceneTime)*Math.PI*2/(5.8+m.index*.33)+m.index*1.11)*18*scale;
  return center;
}
function paintRelic(ctx,m,center,unit,alpha,energy,detail=false)`);
// All feed endpoints share the same floating center as their relic.
renderer=renderer.replaceAll("p:screenWith([...m.center,m.z],'ports')","p:nativeRelicCenter(m)")
  .replace("const source=screenWith([...m.center,m.z],'ports').slice(0,2)","const source=nativeRelicCenter(m).slice(0,2)")
  .replace("const center=screenWith([...m.center,m.z],'ports');\n      const k=", "const center=nativeRelicCenter(m);\n      const k=");
change('const x=Math.floor(center[0]),y=Math.floor(center[1]),local=[radius+center[0]-x,radius+center[1]-y]', 'const x=center[0],y=center[1],local=[radius,radius]');
change('paintRelic(ctx,m,center,.90*k*scale,appear,energy)','paintRelic(ctx,m,center,1.14*k*scale,appear,energy)');
change('extent=.90*k*radius*150/(150-radius)+5','extent=1.14*k*radius*150/(150-radius)+23');
change('if(detail&&!mat.glass){','if(!mat.glass){');
// Fade a cached complete relic as one object. Rebuilding every face while its
// opacity changes defeats the rotation cache during both entry and retirement.
change('if(!config.liveRelics&&alpha===1&&(energy===0||energy>.999)){','const cached=!config.liveRelics&&(energy===0||energy>.999);\n  if(cached){');
change('ctx.globalCompositeOperation=\'source-over\';ctx.drawImage(tile,x-radius,y-radius);',"ctx.globalCompositeOperation='source-over';ctx.globalAlpha=cached?alpha:1;ctx.drawImage(tile,x-radius,y-radius);");
change('const u=((playhead*.11*line.flow+j*.173)%1+1)%1','const u=((lifecycle.motionTime(playhead)*.11*line.flow+j*.173)%1+1)%1');
renderer=require('./native-render-performance.cjs')(renderer);
renderer=require('./native-forming-performance.cjs')(renderer);
renderer=require('./native-visual-refinements.cjs')(renderer);
function write(name,body){fs.writeFileSync(path.join(out,name),body);}
write('renderer.js',renderer);
let atmosphere=read(path.join(src,'atmosphere.js'));
atmosphere=atmosphere.replace('draw(ctx,w,h,t,timing){','draw(ctx,w,h,t,timing){\n        const motion=window.__nativeTiming?.ambient??t;')
  .replace('ctx.drawImage(cloud,0,0,w,h);','ctx.drawImage(cloud,-w*.012+w*.004*Math.sin(motion*.07),-h*.012+h*.003*Math.sin(motion*.09),w*1.024,h*1.024);')
  .replace('ctx.translate(w*.5,h*.155);ctx.rotate(-.055);','ctx.translate(w*(.5+.007*Math.sin(motion*.09)),h*(.155+.003*Math.sin(motion*.11)));ctx.rotate(-.055+.003*Math.sin(motion*.07));')
  .replace('Math.sin(t*.16+i)','Math.sin(motion*.32+i)')
  .replace('const phase=t*.19+item.phase,shift=Math.sin(t*.095+item.phase)*.008;','const phase=motion*.19+item.phase,shift=Math.sin(motion*.095+item.phase)*.008;')
  .replace('api.stats={time:t,','api.stats={time:t,motionTime:motion,');
atmosphere=atmosphere.replace('const target=config.client,screen=config.screen,rect=', 'const currentLayout=window.__nativeGeometry||config,target=currentLayout.client,screen=currentLayout.screen,rect=').replace('auroraAlpha,timing,config)','auroraAlpha,timing,window.__nativeGeometry||config)').replace("windowMode:'existing-small-window-fallback'","windowMode:'native-client-geometry'")
  .replace('curtains:auroraAlpha>0?[{left:.075,top:.255,right:.925,bottom:.745}]:[]','curtains:auroraAlpha>0?[{left:volumeBounds.x/w,top:volumeBounds.y/h,right:(volumeBounds.x+volumeBounds.width)/w,bottom:(volumeBounds.y+volumeBounds.height)/h}]:[]');
// No synthetic window painter ships in the native runtime.
const painter=atmosphere.indexOf('      window(ctx,w,h,t,readyAt){');assert(painter>=0);
atmosphere=atmosphere.slice(0,painter)+"    };return api;\n  };\n})();\n";
write('atmosphere.js',atmosphere);
write('aurora-volume.js',read(path.join(src,'aurora-volume.js'))
  .replace('gl.uniform1f(uniforms.time,time);','gl.uniform1f(uniforms.time,window.__nativeTiming?.ambient??time);')
  // Both side fades are outside the visible viewport, with the same ray samples.
  .replace('x:w*.075,y:h*.255,width:w*.85,height:h*.49','x:-w*.18,y:h*.255,width:w*1.36,height:h*.49'));
write('texture.js',"window.__auroraTexture='assets/galaxy-field.webp';\nwindow.__auroraReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;\nwindow.__nativeTiming={ambient:0,motionOffset:0};\n");
const index=read(path.join(src,'index.html')),scripts=[...index.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const legacy=scripts.find(m=>m[2].startsWith('window.codexWordmark='))?.[2];assert(legacy,'Missing accepted contour code');write('legacy.js',legacy);
write('ring-cache.js',read(path.join(root,'animation/native-forming-ring.js')));
const atlasRoot=path.join(root,'animation/assets/relic-atlases'),atlasManifest=JSON.parse(read(path.join(atlasRoot,'manifest.json')));
assert.equal(atlasManifest.sourceSha256,hash(fs.readFileSync(path.join(src,'renderer.js'))),'Rebake relic atlases after changing the accepted model source');
for(const file of atlasManifest.files)assert.equal(file.sha256,hash(fs.readFileSync(path.join(atlasRoot,file.name))),'Relic atlas checksum: '+file.name);
fs.cpSync(path.join(root,'animation/assets/relic-atlases'),path.join(out,'assets/relic-atlases'),{recursive:true});
fs.copyFileSync(path.join(src,'assets/gsap.min.js'),path.join(out,'gsap.min.js'));
fs.copyFileSync(path.join(root,'animation/assets/galaxy-field.webp'),path.join(out,'assets/galaxy-field.webp'));
const adapter=read(path.join(root,'animation/v12-native-adapter.js')).replaceAll('galaxy-six-relic-flow-g-v12','aurora-universe-g-v4')
  .replace('ambient:wall,motionOffset:f.motionOffset','ambient:wall*(window.__auroraReducedMotion ? .12 : 1),motionOffset:f.motionOffset*(window.__auroraReducedMotion ? .12 : 1)')
  // Cold launches have no real layout yet. Build retained ring buffers before
  // animation starts too, so their first allocation cannot freeze rotation.
  .replace('api.seek(0);native.rendered();',"api.seek(0);api.prewarm();window.__nativeSpritesReady.then(()=>native.rendered(),()=>native.failed('法器材质资源加载失败。'));")
  // A consistent 30 Hz cadence leaves the integrated GPU time to composite all
  // layers. The lifecycle still uses elapsed wall time and actual readiness.
  .replace('if(stopped)return;','if(stopped)return;\n    if(last&&now-last<32){requestAnimationFrame(frame);return;}last=now;');write('native-adapter.js',adapter);
let html=index.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g,(all,attrs)=>attrs.includes('application/json')?all:'');
html=html.replace('style="width:1280px;height:760px"','style="width:100vw;height:100vh"');
html=html.replace('</head>',`<meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'self';style-src 'unsafe-inline';img-src 'self';connect-src 'none';object-src 'none'">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}#aurora-universe-g-v4{width:100vw;height:100vh;position:relative}#aurora-universe-g-v4 canvas{width:100%;height:100%;background:transparent!important}</style></head>`);
html=html.replace('</body>',['gsap.min.js','../../src/desktop/adaptive-clock.cjs','../../src/desktop/stroke-batch.cjs','texture.js','legacy.js','ring-cache.js','aurora-volume.js','atmosphere.js','renderer.js','native-adapter.js'].map(p=>`<script src="${p}"></script>`).join('')+'</body>');
assert(!html.includes('window.codexMagic='),'Native preload must supply geometry and readiness');write('index.html',html);
write('source-manifest.json',JSON.stringify({visualSource:'b2f2361 / aurora-universe-g-v4',visualAcceptance:'2026-10-20 user 可以，就按这个做吧',originalRendererSha256:hash(original),nativeRendererSha256:hash(renderer),realReadiness:true,realIconRectangles:true,realIconPixelsRead:false,syntheticContent:false,wallClockDurationFixed:false,nativeRevision:{date:'2026-10-20',requested:'continuous waiting motion, floating larger detailed relics',visualReviewPending:true},changes:['native viewport','host motion clock','host content reveal','current client geometry','continuous ambient galaxy and aurora','floating shared relic/feed centers','relic scale +27% and surface etching','reduced motion']},null,2)+'\n');
console.log(JSON.stringify({visual:'accepted-aurora-v4',rendererBytes:Buffer.byteLength(renderer),native:true}));
