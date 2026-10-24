'use strict';
const assert=require('node:assert/strict');
// Native-only retained geometry; the accepted editable preview stays unchanged.
module.exports=function optimizeFormingRenderer(source){let s=source;
s=s.replace('const nativeRelicTiles=[],nativeRelicFrames=[];',`const nativeRelicTiles=[],nativeRelicFrames=[];
const nativeSpriteImages=Array.from({length:6},(_,i)=>{const load=e=>{const image=new Image();image.src='assets/relic-atlases/relic-'+i+'-'+e+'.png';return image;},a=load(0);return[a,i===0||i===3?load(1):a];});
window.__nativeSpritesReady=Promise.all(nativeSpriteImages.flat().map(i=>i.decode()));`);
const start=s.indexOf('  const cached=!config.liveRelics'),end=s.indexOf('  const reflected=',start);if(start<0||end<0)throw Error('Missing sprite boundary');
s=s.slice(0,start)+`  const cached=!config.liveRelics;
  if(cached){
    const draw=(index,power,weight)=>{if(weight<=0)return;const column=((index%120)+120)%120;ink.globalAlpha=weight;ink.drawImage(nativeSpriteImages[m.index][power],(column%12)*216,Math.floor(column/12)*216,216,216,radius-108*unit,radius-108*unit,216*unit,216*unit);};
    ink.save();ink.globalCompositeOperation='lighter';draw(lo,0,(1-mix)*(1-energy));draw(lo+1,0,mix*(1-energy));draw(lo,1,(1-mix)*energy);draw(lo+1,1,mix*energy);ink.restore();result={index:m.index,name:relicModels[m.index].name,material:relicModels[m.index].material,totalFaces:relicModels[m.index].faces.length,marks:relicModels[m.index].marks.length,threads:relicModels[m.index].threads.length,angle,energy,atlas:true};
  }else result=paintRelicRaw(ink,m,local,unit,alpha,energy,false);
`+s.slice(end);
const replace=(a,b)=>{assert(s.includes(a),a.slice(0,100));s=s.replace(a,b)};
// Interior rectangles do not change the array's world geometry. Position and
// scale are uniforms; a readiness/layout reply must not re-upload every stroke.
replace('api.layout(layout=>{nativeContourRevision++;nativeRingCache?.invalidate();','api.layout(layout=>{nativeContourRevision++;');
replace('const retaining=!config.liveRing&&nativeRingCache&&localTime>=5&&sceneTime<lifecycle.timing.releaseAt;','const retaining=!config.liveRing&&nativeRingCache;');
// Geometry for the GPU is always complete. Its own clock clips each segment.
replace('visible.map(p=>portion(p,currentTime)).filter(Boolean)','visible.map(p=>portion(p,1000)).filter(Boolean)');
replace('const gVisible=gDrawing.map(p=>portion(p,currentTime))','const gVisible=gDrawing.map(p=>portion(p,retaining?1000:currentTime))');
replace('const retained=!config.liveRing&&localTime>=5&&sceneTime<lifecycle.timing.releaseAt;','const retained=!config.liveRing&&nativeRingCache;');
// The original condition is inside a larger expression.
s=s.replace('||!config.liveRing&&nativeRingCache&&localTime>=5&&sceneTime<lifecycle.timing.releaseAt','||!config.liveRing&&nativeRingCache');
replace('nativeRingCache.draw(ctx,{w,h,ox,oy,scale,cfg,transforms}', 'nativeRingCache.draw(ctx,{w,h,ox,oy,scale,cfg,transforms,time:playhead,lead:constructionLead,extinguish:lifecycle.timing.extinguishAt-lifecycle.timing.entryLead}');
replace('op:ctx.globalCompositeOperation,g:nativeStrokeRecord.g,order:nativeStrokeRecord.records.length','op:ctx.globalCompositeOperation,g:nativeStrokeRecord.g,order:nativeStrokeRecord.records.length,path:nativeStrokeRecord.path,power:nativeStrokeRecord.power');
replace("const weight=p.kind.startsWith('sky')?.36+.64*smooth((localTime-arrival(p.kind,p.points[0]))/.50):.36;", "const weight=p.kind.startsWith('sky')?1:.36;");
replace("nativeStrokeRecord.g=false;}drawPath", "nativeStrokeRecord.g=false;nativeStrokeRecord.path=p;nativeStrokeRecord.power=p.kind.startsWith('sky')?[2,arrival(p.kind,p.points[0])]:[0,0];}drawPath");
replace('g:false,blur:blur*Math.max(.65*dpr,scale)/scale','g:false,blur:blur*Math.max(.65*dpr,scale)/scale,path:p,power:[1,arrival(p.kind,p.points[Math.floor(p.points.length/2)])]');
replace('nativeStrokeRecord.g=true;}drawPath','nativeStrokeRecord.g=true;nativeStrokeRecord.path=p;nativeStrokeRecord.power=[0,0];}drawPath');
replace('  function drawActivation(ctx,p){',`  function drawActivation(ctx,p){if(nativeStrokeRecord){
    if(p.color==='cut'||p.color===colors.cut||p.color===colors.paper)return;
    const warm=p.color==='ink'||p.color==='low'||p.color==='mid'||p.color===colors.ink||p.color===colors.low||p.color===colors.mid;if(!warm)return;
    const main=p.width>=.74,primary=p.kind==='g'&&p.width>1,support=p.kind==='inscription'||p.kind==='sky-symbol',thickness=Math.max(.28*dpr,p.width*scale),previous=ctx.globalCompositeOperation;
    ctx.globalCompositeOperation=darkPaper?'lighter':'source-over';
    for(const segment of pathActivation(p)){const projected=segment.points.map(screen);nativeStrokeRecord.power=[1,segment.arrival];
      rawStroke(ctx,projected,thickness*(primary?.88:.84),colors.ink,p.alpha*(support?.17:main?.40:.27));
      if(main&&bloomEligible(p)){rawStroke(ctx,projected,Math.max(.18*dpr,thickness*.22),colors.core,p.alpha*(primary?.58:.36));nativeStrokeRecord.power=[3,segment.arrival];rawStroke(ctx,projected,Math.max(.18*dpr,thickness*.22),colors.core,p.alpha*.20);}
      if(main){nativeStrokeRecord.power=[3,segment.arrival];rawStroke(ctx,projected,thickness*2.15,colors.ember,p.alpha*.22);}
    }nativeStrokeRecord.power=[0,0];ctx.globalCompositeOperation=previous;return;}
`);
// Keep animated pen tips as inexpensive foreground strokes.
replace("    nativeMark('strokes');drawGathering(ctx);",`    if(retained){for(const p of [...visible,...gDrawing])if(currentTime>p.start&&currentTime<p.start+p.dur){paintTransform=transforms[layerFor(p.kind)];const partial=portion(p,currentTime);if(partial)drawFront(ctx,{...partial,color:colors[p.color]||p.color});}}
    nativeMark('strokes');drawGathering(ctx);`);

return s;
};
