(() => {
  'use strict';
  // Original emission-volume study: no solid ribbon mesh, material normals or specular surface.
  window.makeVolumeAurora=()=>{
    const surface=document.createElement('canvas'),composite=document.createElement('canvas');
    const gl=surface.getContext('webgl2',{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:false});
    if(!gl)throw Error('Aurora volume requires WebGL2');
    const vertex=`#version 300 es
    in vec2 position;out vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
    const fragment=`#version 300 es
    precision highp float;in vec2 uv;out vec4 color;
    uniform sampler2D field;uniform float time;uniform float strength;
    float n(vec2 p){return texture(field,p/256.).r;}
    float fbm(vec2 p){return n(p)*.57+n(p*2.031+27.9)*.28+n(p*4.101+41.3)*.15;}
    float path(float x,float seed,float t){
      float q=x+seed*1.31;
      return sin(q*1.73+t*.17)*1.08+sin(q*4.71-t*.11)*.34+sin(q*9.34+t*.09)*.085+(fbm(vec2(q*7.5,t*.43+seed*19.))-.5)*.19;
    }
    void main(){
      vec2 p=vec2(uv.x*2.-1.,uv.y);
      vec3 origin=vec3(.13,.13,-3.5),ray=normalize(vec3(p.x*1.75,p.y*1.26-.22,1.9));
      vec3 light=vec3(0.);float accumulated=0.;float t=time*.45;
      const float stepSize=.041;
      for(int i=0;i<104;i++){
        float distance=2.15+(float(i)+.5)*stepSize;
        vec3 pos=origin+ray*distance;
        for(int layer=0;layer<2;layer++){
          float seed=float(layer)*3.17;
          float center=path(pos.x,seed,t)+float(layer)*.78;
          float delta=pos.z-center;
          if(abs(delta)>.18)continue;
          float hNoise=fbm(vec2(pos.x*5.4+seed*29.,t*.23+14.));
          float base=.46+.35*sin(pos.x*1.32+seed)+.12*sin(pos.x*3.8-seed)+.10*(hNoise-.5);
          float height=1.05+.85*hNoise;
          float y=(pos.y-base)/height;
          if(y<-.09||y>1.9)continue;
          float narrow=exp(-delta*delta/(.0015+.0014*hNoise));
          float halo=exp(-delta*delta/.012)*.075;
          float column=fbm(vec2(pos.x*82.+fbm(vec2(pos.x*4.,t*.18))*12.+seed*33.,seed*18.+t*.36));
          float rays=.30+1.15*pow(max(0.,column),2.2);
          float torn=fbm(vec2(pos.x*6.+seed*71.,pos.y*2.-t*.13));
          float foot=exp(-pow((y-.065)/.078,2.));
          float vertical=smoothstep(-.055,.035,y)*(.46*foot+.46*exp(-max(0.,y)*3.05)*rays);
          vertical*=1.-smoothstep(.48,1.6,y);
          float span=exp(-pow(abs((pos.x+float(layer)*.25)/2.50),8.));
          span*=.14+.86*smoothstep(.28,.65,fbm(vec2(pos.x*4.3+t*.1,seed*11.+7.)));
          float density=(narrow+halo)*vertical*span*(.68+.32*torn)*(layer==0?1.:.62);
          float pigment=clamp(y*.9,0.,1.);
          vec3 tint=mix(vec3(.16,.70,.36),vec3(.10,.42,.52),smoothstep(.08,.47,pigment));
          tint=mix(tint,vec3(.48,.17,.63),smoothstep(.25,.90,pigment));
          light+=tint*density*stepSize*2.4;
          accumulated+=density*stepSize;
        }
      }
      vec3 rgb=vec3(1.)-exp(-light*strength*4.9);
      float border=smoothstep(0.,.065,uv.x)*(1.-smoothstep(.92,1.,uv.x));
      border*=smoothstep(0.,.09,uv.y)*(1.-smoothstep(.94,1.,uv.y));
      rgb*=border;
      float alpha=max(rgb.r,max(rgb.g,rgb.b));color=vec4(rgb,alpha);
    }`;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const a=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    let seed=20261020;const pixels=new Uint8Array(256*256);for(let i=0;i<pixels.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;pixels[i]=(seed>>>0)>>>24;}
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,256,256,0,gl.RED,gl.UNSIGNED_BYTE,pixels);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    const uniforms={time:gl.getUniformLocation(program,'time'),strength:gl.getUniformLocation(program,'strength')};gl.uniform1i(gl.getUniformLocation(program,'field'),0);
    const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
    return{
      surface,
      draw(ctx,w,h,time,opacity=1,timing=null,config=null){
        const rect={x:w*.075,y:h*.255,width:w*.85,height:h*.49};
        const rw=Math.round(rect.width*.7),rh=Math.round(rect.height*.7);
        if(surface.width!==rw||surface.height!==rh){surface.width=rw;surface.height=rh;}
        gl.viewport(0,0,rw,rh);gl.useProgram(program);gl.disable(gl.BLEND);gl.uniform1f(uniforms.time,time);gl.uniform1f(uniforms.strength,4.1);gl.drawArrays(gl.TRIANGLES,0,6);
        if(composite.width!==Math.round(rect.width)||composite.height!==Math.round(rect.height)){composite.width=Math.round(rect.width);composite.height=Math.round(rect.height);}
        const ink=composite.getContext('2d');ink.clearRect(0,0,composite.width,composite.height);ink.globalCompositeOperation='source-over';ink.globalAlpha=1;ink.drawImage(surface,0,0,composite.width,composite.height);
        if(timing&&config){const r=config.client,s=config.screen,dim=smooth((time-(timing.windowAt-.7))/2.7)*.88;ink.save();ink.globalCompositeOperation='destination-out';ink.globalAlpha=dim;ink.fillStyle='#fff';ink.filter='blur(9px)';ink.fillRect((r.x-s.x)/s.width*w-rect.x,(r.y-s.y)/s.height*h-rect.y,r.width/s.width*w,r.height/s.height*h);ink.restore();}
        ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=opacity;ctx.drawImage(composite,rect.x,rect.y);ctx.restore();
        return{...rect,algorithm:'emission-volume-raymarch',samples:104,solidRibbon:false};
      }
    };
  };
})();
