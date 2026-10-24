'use strict';
const assert=require('node:assert/strict');
module.exports=function optimizeNativeRenderer(source){
// Preserve all 96 curve segments, while reusing their vertex and index storage.
const start=source.indexOf('      ribbon(points,width,alpha,head,seed,warm=false,separation=0){'),end=source.indexOf('      stream(points,',start);assert(start>=0&&end>start);
source=source.slice(0,start)+`      ribbon(points,width,alpha,head,seed,warm=false,separation=0){
        const p0=points[0],p1=points[1],p2=points[2],p3=points[3];
        const ax=-p0[0]+3*p1[0]-3*p2[0]+p3[0],bx=3*p0[0]-6*p1[0]+3*p2[0],cx=-3*p0[0]+3*p1[0];
        const ay=-p0[1]+3*p1[1]-3*p2[1]+p3[1],by=3*p0[1]-6*p1[1]+3*p2[1],cy=-3*p0[1]+3*p1[1];
        for(let i=0;i<=96;i++){
          const k=i*5,t=ribbonShape[k],lo=ribbonShape[k+1],hi=ribbonShape[k+2];
          let x=((ax*t+bx)*t+cx)*t+p0[0],y=((ay*t+by)*t+cy)*t+p0[1];
          const dx=(((ax*hi+bx)*hi+cx)*hi+p0[0])-(((ax*lo+bx)*lo+cx)*lo+p0[0]);
          const dy=(((ay*hi+by)*hi+cy)*hi+p0[1])-(((ay*lo+by)*lo+cy)*lo+p0[1]),len=Math.hypot(dx,dy)||1;
          const breathe=.35+.65*Math.sin(t*9.4+seed*.6-playhead*.50);
          const displacement=ribbonShape[k+3]*(separation*breathe+width*.23*Math.sin(t*17.3+seed+playhead*.39));
          x-=dy/len*displacement;y+=dx/len*displacement;
          const taper=ribbonShape[k+4]*(.73+.16*Math.sin(t*13.+seed)+.11*Math.sin(t*27.-playhead*.46+seed)),wide=width*taper,j=i*8;
          ribbonRows[j]=x-dy/len*wide;ribbonRows[j+1]=y+dx/len*wide;ribbonRows[j+2]=0;ribbonRows[j+3]=t;
          ribbonRows[j+4]=x+dy/len*wide;ribbonRows[j+5]=y-dx/len*wide;ribbonRows[j+6]=1;ribbonRows[j+7]=t;
        }
        for(let i=0;i<ribbonIndices.length;i++){const from=ribbonIndices[i],to=i*4;for(let k=0;k<4;k++)ribbonMesh[to+k]=ribbonRows[from+k];}
        draw(ribbonMesh,warm?(separation?4:2):(separation?3:1),alpha,head,seed);
      },
`+source.slice(end);
const init=`    const ribbonRows=new Float32Array(97*8),ribbonMesh=new Float32Array(96*6*4),ribbonShape=new Float64Array(97*5),ribbonIndices=new Uint16Array(96*6);
    for(let i=0;i<=96;i++){const t=i/96,k=i*5,s=Math.sin(Math.PI*t);ribbonShape[k]=t;ribbonShape[k+1]=Math.max(0,t-.0001);ribbonShape[k+2]=Math.min(1,t+.0001);ribbonShape[k+3]=Math.pow(s,1.45);ribbonShape[k+4]=.10+.90*Math.pow(s,.72);}
    for(let i=0;i<96;i++)ribbonIndices.set([i*8,i*8+4,(i+1)*8,(i+1)*8,i*8+4,(i+1)*8+4],i*6);
`;
source=source.replace('    let w=0,h=0;',init+'    let w=0,h=0;');
source=source.replace('new Float32Array(vertices),gl.DYNAMIC_DRAW','vertices instanceof Float32Array?vertices:new Float32Array(vertices),gl.DYNAMIC_DRAW');
source=source.replace('window.__nativeGeometry=config;','window.__nativeGeometry=config;let nativeContourCache=null,nativeContourRevision=0;');
source=source.replace('api.layout(layout=>{nativeRingCache?.invalidate();','api.layout(layout=>{nativeContourRevision++;nativeRingCache?.invalidate();');
const contourStart=source.indexOf('    const wordProgress=restoredWord.update(legacyTime);'),contourEnd=source.indexOf('    const mistAge=',contourStart);assert(contourStart>=0&&contourEnd>contourStart);
// The held playhead converges to a fixed value. Avoid invalidating its SVG
// repeatedly; a fresh native layout always invalidates the contour snapshot.
const original=source.slice(contourStart,contourEnd),geometry=original.split('\n').find(l=>l.includes('const nativeRect=')),drawing=original.replace(geometry+'\n','');
source=source.slice(0,contourStart)+geometry+'\n'+`    const contourKey=[Math.floor(legacyTime*120),w,h,nativeRect.x,nativeRect.y,nativeRect.width,nativeRect.height,nativeContourRevision].join('|');
    if(!nativeContourCache||nativeContourCache.key!==contourKey){
`+drawing+`      nativeContourCache={key:contourKey,wordProgress,interior,beam:window.windowConstructionFrame.beam,edge:window.windowConstructionFrame.edge,sealOpacity:Number(legacySvg.querySelector('[data-corner-seal]')?.getAttribute('opacity')||0)};
    }
    const {wordProgress,interior}=nativeContourCache;
`+source.slice(contourEnd);
source=source.replace('beam:window.windowConstructionFrame.beam,edge:window.windowConstructionFrame.edge,sealOpacity:Number(legacySvg.querySelector(\'[data-corner-seal]\')?.getAttribute(\'opacity\')||0),interior,windowStart:', 'beam:nativeContourCache.beam,edge:nativeContourCache.edge,sealOpacity:nativeContourCache.sealOpacity,interior,windowStart:');

return source;
};
