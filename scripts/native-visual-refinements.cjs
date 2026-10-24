'use strict';
const assert=require('node:assert/strict');
module.exports=function refineNativeVisuals(source){
  function change(a,b){assert(source.includes(a),'Missing native visual boundary: '+a.slice(0,100));source=source.replace(a,b);}
  // Enlarge ring planes and their lettering without making the six relics
  // compete for the limited vertical space below the real application window.
  change('  const cfg={','  const nativeArrayExpansion=1.30;\n  const cfg={');
  change('const [px,py,z]=point,x=px*rotation[0]-py*rotation[1],y=px*rotation[1]+py*rotation[0];',
    'const [px,py,z]=point,magnify=layer<3?nativeArrayExpansion:1,x=(px*rotation[0]-py*rotation[1])*magnify,y=(px*rotation[1]+py*rotation[0])*magnify;');
  source=source.replaceAll('polar(cfg.skyRadius,a)','polar(cfg.skyRadius*nativeArrayExpansion,a)');
  change('const radius=Math.hypot(q[0],q[1]);ys.push(py(radius,q[2]),py(-radius,q[2]));',
    'const radius=Math.hypot(q[0],q[1])*nativeArrayExpansion;ys.push(py(radius,q[2]),py(-radius,q[2]));');
  change('ys.push(py(330,cfg.starZ)+18,py(-330,cfg.starZ)-18);',
    'ys.push(py(330*nativeArrayExpansion,cfg.starZ)+18,py(-330*nativeArrayExpansion,cfg.starZ)-18);');
  change('windowBottom:bottom,scale,gap','windowBottom:bottom,scale,gap,arrayExpansion:nativeArrayExpansion');
  // Screen-space enlargement preserves perspective and does not get cancelled
  // by the old fit-to-height calculation. Relics now occupy two side columns.
  change('const nativeArrayExpansion=1.30;','const nativeArrayExpansion=1.30,nativeRingZoom=[1.60,1.50],nativeRelicZoom=1.60,nativeStarZoom=1.60;');
  change('result.frame=nativeProjectionFrame;', 'if(layer<3){result[0]*=nativeRingZoom[0];result[1]*=nativeRingZoom[1];}result.frame=nativeProjectionFrame;');
  change('scale,cfg,transforms,time:playhead','scale,cfg,transforms,stretch:nativeRingZoom,time:playhead');
  change("const center=screenWith([...m.center,m.z],'ports');",`const side=m.index===0||m.index===1||m.index===5?1:-1;
  const row=m.index===4||m.index===5?0:m.index===0||m.index===3?1:2;
  const available=canvas.height-window.__auroraLayout.windowBottom;
  const inset=row===1?.025:.075;
  const center=[canvas.width*(side>0?1-inset:inset),window.__auroraLayout.windowBottom+available*[-.12,.30,.70][row],0];`);
  change('paintRelic(ctx,m,center,1.14*k*scale,appear,energy)','paintRelic(ctx,m,center,1.14*k*scale*nativeRelicZoom,appear,energy)');
  // Shared star centres also keep their incoming discharges attached.
  change('return screen([c[0],c[1],cfg.starZ]);', 'const q=screen([c[0],c[1],cfg.starZ]);return[ox+(q[0]-ox)*nativeRingZoom[0],oy+(q[1]-oy)*nativeRingZoom[1]-28*dpr,q[2]];');
  change('const c=polar(cfg.skyRadius*nativeArrayExpansion,a),center=screen([c[0],c[1],cfg.starZ]);','const center=starCenter(i);');
  change('const factor=.48*scale,energy=starEnergy(i)', 'const factor=.48*scale*nativeStarZoom,energy=starEnergy(i)');
  source=source.replaceAll('node[0]*.48*scale','node[0]*.48*scale*nativeStarZoom').replaceAll('node[1]*.48*scale','node[1]*.48*scale*nativeStarZoom');
  change('arrayExpansion:nativeArrayExpansion','arrayExpansion:nativeArrayExpansion,ringZoom:nativeRingZoom,relicZoom:nativeRelicZoom,starZoom:nativeStarZoom,origin:[ox,oy]');
  change('opacity:alpha};','opacity:alpha,unit};');
  // Use the actual last deposited letter sample, not the later window phase.
  change('},samples:particles.length};','},completeAt:Math.max(...particles.map(p=>p.arrival+.18)),samples:particles.length};');
  change('mistAlpha=smooth(mistAge/.45)*(1-smooth((legacyTime-8.45)/1.25))',
    'mistAlpha=smooth(mistAge/.45)*(1-smooth((legacyTime-restoredWord.completeAt)/.50))');
  return source;
};
