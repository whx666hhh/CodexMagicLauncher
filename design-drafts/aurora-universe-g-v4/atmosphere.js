(() => {
  'use strict';
  window.makeAuroraUniverse=(root,config)=>{
    const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);},rise=(a,b,t)=>smooth((t-a)/(b-a));
    const galaxy=new Image();galaxy.src=window.__auroraTexture;
    const cloud=document.createElement('canvas'),curtain=document.createElement('canvas');let key='';
    const noise=(x,y)=>{const hash=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^20261020;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};const a=Math.floor(x),b=Math.floor(y),u=smooth(x-a),v=smooth(y-b);return(hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;};
    const fbm=(x,y)=>{let n=0,a=.55;for(let i=0;i<5;i++){n+=noise(x,y)*a;x=x*2.03+17.1;y=y*2.01+8.9;a*=.49;}return n;};
    const envelope=t=>rise(6.0,9.9,t)*(1-rise(23.85,27.65,t));
    const curtains=[];const volume=window.makeVolumeAurora();
    const api={stats:{},reflection(index,t,angle){const local=.6+.4*Math.sin(t*.37+index*1.7);return envelope(t)*(.035+.105*local)*(.2+.8*Math.max(0,Math.cos(angle+index*.37)));},
      draw(ctx,w,h,t,timing){
        if(key!==w+'|'+h){
          key=w+'|'+h;cloud.width=640;cloud.height=Math.round(640*h/w);const c=cloud.getContext('2d'),pixels=c.createImageData(cloud.width,cloud.height);
          for(let y=0;y<cloud.height;y++)for(let x=0;x<cloud.width;x++){
            const u=x/cloud.width,v=y/cloud.height,a=fbm(u*3.4,v*4.6),warp=fbm(u*1.8+31,v*2.3),band=.23-.12*u+.15*Math.sin(u*4.8+1.3);
            const volume=Math.exp(-Math.pow((v-band)/(.16+.10*warp),2))+.55*Math.exp(-Math.pow((u-.92)/.3,2)-Math.pow((v-.31)/.19,2)),wisps=Math.pow(clamp((a-.24)*2.0),1.5)*volume;
            const dark=1-.72*Math.exp(-Math.pow((v-(.24-.10*u+.047*Math.sin(u*10)))/(.026+.08*warp),2));
            const purple=.5+.5*Math.sin(u*6.7+v*3),light=wisps*dark,fade=1-smooth((v-.48)/.26),i=(y*cloud.width+x)*4;
            pixels.data[i]=2+light*(58+purple*20)*fade;pixels.data[i+1]=5+light*(76+purple*7)*fade;pixels.data[i+2]=12+light*(129+purple*9)*fade;pixels.data[i+3]=255;
          }
          c.putImageData(pixels,0,0);curtain.width=Math.round(w*.75);curtain.height=Math.round(h*.75);
        }
        ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(cloud,0,0,w,h);
        // The inherited local galaxy texture supplies coherent dust lanes. No external image request.
        const galaxyAlpha=rise(1.8,5.1,t)*(1-rise(timing.restoreAt,timing.restoreEnd,t));
        if(galaxy.complete&&galaxy.naturalWidth){ctx.save();ctx.translate(w*.5,h*.155);ctx.rotate(-.055);ctx.globalCompositeOperation='screen';ctx.globalAlpha=galaxyAlpha*.67;ctx.filter='blur(.65px) saturate(.72) brightness(.84)';ctx.drawImage(galaxy,-w*.62,-h*.175,w*1.24,h*.35);ctx.restore();}
        // Sparse reference stars: their size hierarchy provides distance without granular fill.
        ctx.globalCompositeOperation='screen';for(let i=0;i<160;i++){
          const u=noise(i,61),v=noise(i,63),r=(i%37===0?1.0:.36)*w/1280,alpha=(i%37===0?.45:.16)*(1-.40*smooth((v-.42)/.4));
          ctx.globalAlpha=alpha*(.92+.08*Math.sin(t*.16+i));ctx.fillStyle=i%17===0?'#c7c2de':'#a9bfd8';ctx.beginPath();ctx.arc(u*w,v*h,r,0,Math.PI*2);ctx.fill();
        }
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
        const ink=curtain.getContext('2d'),cw=curtain.width,ch=curtain.height;ink.clearRect(0,0,cw,ch);ink.globalCompositeOperation='lighter';
        const auroraAlpha=envelope(t),open=rise(6.0,9.9,t),geometry=[];
        if(auroraAlpha>0)for(const spec of curtains){
          const lowerOffset=Math.max(0,Math.min(.12,(window.__auroraLayout?.arrayTop/h??.73)-.62));
          const item={...spec,y:spec.y+lowerOffset};
          const phase=t*.19+item.phase,shift=Math.sin(t*.095+item.phase)*.008;
          const start=(item.x+shift)*cw,width=item.width*cw;
          const gradient=ink.createLinearGradient(0,(item.y-item.height)*ch,0,(item.y+.07)*ch);
          gradient.addColorStop(0,'#ae83d600');gradient.addColorStop(.25,'#9a8bc51e');gradient.addColorStop(.58,'#91b6c66b');gradient.addColorStop(.84,'#72c8aeaa');gradient.addColorStop(1,'#a2d7ba00');ink.fillStyle=gradient;
          const segments=180,step=width/segments;
          const foot=u=>(item.y+.042*Math.sin(u*6.5+phase)+.022*Math.sin(u*13.2-phase*.7)+.012*Math.sin(u*21+phase*.9))*ch;
          const top=u=>foot(u)-item.height*ch*(.69+.22*Math.sin(u*5.6+phase*.4)+.09*Math.sin(u*17+item.phase));
          let minY=Infinity,maxY=-Infinity;
          for(let i=0;i<segments;i++){
            const u=i/segments,v=(i+1)/segments,x=start+u*width;
            const edge=Math.pow(Math.sin(Math.PI*u),.65),fold=.24+.76*Math.pow(.5+.5*Math.cos(u*25+phase*.7+Math.sin(u*8-phase)),3);
            const rays=.58+.42*noise(i+Math.floor(item.phase*100),91);ink.globalAlpha=auroraAlpha*item.alpha*edge*fold*rays;
            const y=foot(u),ty=top(u),ny=foot(v),nty=top(v),lean=(Math.sin(u*9+phase)*.012+.008)*cw;
            minY=Math.min(minY,ty);maxY=Math.max(maxY,y);ink.beginPath();ink.moveTo(x+lean,ty);ink.bezierCurveTo(x+lean*.75,ty+(y-ty)*.45,x+lean*.2,y-14,x,y);ink.lineTo(x+step,ny);ink.bezierCurveTo(x+step+lean*.2,ny-14,x+step+lean*.75,nty+(ny-nty)*.45,x+step+lean,nty);ink.closePath();ink.fill();
          }
          // A broken, narrow lower fold anchors the translucent vertical rays.
          ink.strokeStyle='#9ee2c4';ink.lineWidth=.65*cw/960;ink.globalAlpha=auroraAlpha*item.alpha*.035;ink.beginPath();for(let i=0;i<=segments;i++){const u=i/segments,x=start+width*u,y=foot(u);if(i===0)ink.moveTo(x,y);else ink.lineTo(x,y);}ink.stroke();
          geometry.push({left:(start-.016*cw)/cw,top:minY/ch,right:(start+width+.025*cw)/cw,bottom:(maxY+.01*ch)/ch});
        }
        const target=config.client,screen=config.screen,rect={x:(target.x-screen.x)/screen.width*cw,y:(target.y-screen.y)/screen.height*ch,width:target.width/screen.width*cw,height:target.height/screen.height*ch};
        const centralDim=rise(timing.windowAt-.7,timing.windowAt+2,t)*.88;
        if(centralDim>0){ink.save();ink.globalCompositeOperation='destination-out';ink.globalAlpha=centralDim;ink.fillStyle='#fff';ink.filter='blur(10px)';ink.fillRect(rect.x,rect.y,rect.width,rect.height);ink.restore();}
        ctx.drawImage(curtain,0,0,w,h);const volumeBounds=volume.draw(ctx,w,h,t,auroraAlpha,timing,config);ctx.restore();
        api.stats={time:t,auroraAlpha,open,centralDim,curtains:auroraAlpha>0?[{left:.075,top:.255,right:.925,bottom:.745}]:[],auroraAlgorithm:volumeBounds.algorithm,solidRibbon:false,fullScreen:false,inflowStreams:0,material:'continuous-local-galaxy-texture',windowMode:'existing-small-window-fallback',windowRect:{...target},layout:window.__auroraLayout,planets:0};
      },
      window(ctx,w,h,t,readyAt){
        const alpha=rise(readyAt,readyAt+.7,t);if(alpha<=0)return;
        const s=config.screen,r=config.client,x=(r.x-s.x)/s.width*w,y=(r.y-s.y)/s.height*h,ww=r.width/s.width*w,hh=r.height/s.height*h;
        ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=alpha;ctx.fillStyle='#0b1018';ctx.fillRect(x,y,ww,hh);ctx.strokeStyle='#65707e';ctx.lineWidth=.65;ctx.strokeRect(x,y,ww,hh);ctx.globalAlpha=alpha*.22;ctx.strokeStyle='#65707e';ctx.beginPath();ctx.moveTo(x+ww*.20,y);ctx.lineTo(x+ww*.20,y+hh);ctx.moveTo(x+ww*.20,y+hh*.075);ctx.lineTo(x+ww,y+hh*.075);ctx.stroke();ctx.restore();
      }
    };return api;
  };
})();
