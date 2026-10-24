'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
// Optional developer tool: use an existing Puppeteer module and Chromium.
// PUPPETEER_MODULE and CHROME_EXECUTABLE accept their absolute local paths.
const pup=require(process.env.PUPPETEER_MODULE||'puppeteer-core'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'..'),out=path.join(repo,'animation/assets/relic-atlases');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await pup.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11','--enable-gpu-rasterization','--ignore-gpu-blocklist']});
try{const page=await browser.newPage();await page.setViewport({width:1536,height:960,deviceScaleFactor:1});await page.setRequestInterception(true);page.on('request',r=>{if(r.url().endsWith('/renderer.js')){let s=fs.readFileSync(path.join(repo,'animation/accepted-aurora-v4/renderer.js'),'utf8').replace('window.__nativeSpritesReady=Promise.all(nativeSpriteImages.flat().map(i=>i.decode()));','window.__nativeSpritesReady=Promise.resolve();');s=s.replace('  function drawIndependentMinisRaw(ctx,paths){',`window.__buildRelicAtlas=(index,energy)=>{const previous={playhead,dpr,scenePaintAlpha};playhead=18;dpr=1;scenePaintAlpha=1;try{
 const size=216,columns=12,count=120,atlas=document.createElement('canvas');atlas.width=size*columns;atlas.height=size*10;const ctx=atlas.getContext('2d');
 for(let i=0;i<count;i++){const tile=document.createElement('canvas');tile.width=tile.height=size;nativeRelicAngleOverride=(i+index/6)*Math.PI/60;paintRelicRaw(tile.getContext('2d'),miniSeals[index],[108,108],1,1,energy,false);ctx.drawImage(tile,(i%columns)*size,Math.floor(i/columns)*size);}
 return atlas.toDataURL('image/png').split(',')[1];
}finally{playhead=previous.playhead;dpr=previous.dpr;scenePaintAlpha=previous.scenePaintAlpha;nativeRelicAngleOverride=null;}};
  function drawIndependentMinisRaw(ctx,paths){`);r.respond({status:200,contentType:'text/javascript',body:s})}else r.continue()});
await page.evaluateOnNewDocument(()=>{requestAnimationFrame=()=>0;const screen={x:0,y:0,width:1920,height:1200},client={x:410,y:80,width:1100,height:740};window.codexMagic={config:{screen,client,scale:1.25,synthetic:true,liveRing:false,liveRelics:false,icons:[]},layout(){},ready(){},start(){},rendered(){},failed(e){throw Error(e)},frame(){}}});await page.goto(pathToFileURL(path.join(repo,'animation/accepted-aurora-v4/index.html')).href,{waitUntil:'load'});
for(let index=0;index<6;index++)for(const energy of index===0||index===3?[0,1]:[0]){const file=path.join(out,`relic-${index}-${energy}.png`);const data=await page.evaluate(({index,energy})=>__buildRelicAtlas(index,energy),{index,energy});fs.writeFileSync(file,Buffer.from(data,'base64'));console.log(JSON.stringify({index,energy,bytes:fs.statSync(file).size}));}
const files=fs.readdirSync(out).filter(name=>/^relic-[0-5]-[01]\.png$/.test(name)).map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex')}));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({source:'design-drafts/aurora-universe-g-v4/renderer.js',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,'design-drafts/aurora-universe-g-v4/renderer.js'))).digest('hex'),frames:120,columns:12,tileSize:216,unit:1,fullyEtched:true,energies:[0,1],files},null,2)+'\n');
}finally{await browser.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
