(() => {
  'use strict';
  // Retain world-space line endpoints. Extrude in screen pixels after projection
  // so a shallow camera does not flatten the stroke's physical width.
  window.makeNativeRingCache=root=>{
    const surface=document.createElement('canvas');surface.setAttribute('data-native-rings','');surface.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;z-index:1';root.insertBefore(surface,root.querySelector('[data-array]'));
    const gl=surface.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true});if(!gl)return null;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
      in vec3 start,end,previous,next;in vec4 pigment;in vec4 stroke;in vec3 anchor;in float blur;
      in vec4 construction;in vec3 activation;uniform float time,lead,extinguish;
      uniform vec2 rotations[4],origin,viewport,stretch;uniform float zoom,slope,depth,aspect,camera;
      out vec4 light;out float distanceAcross;out float halfWidth;out float softness;out float distanceAlong;out float lineLength;
      vec2 project(vec3 p,vec2 turn){vec2 q=vec2(p.x*turn.x-p.y*turn.y,p.x*turn.y+p.y*turn.x);if(stroke.x<2.5)q*=1.30;float k=camera/(camera-q.y*depth-p.z*slope);return origin+vec2(q.x,(q.y*slope-p.z*depth)*aspect)*k*zoom*stretch;}
      void main(){float progress=clamp((time-construction.x)/max(.00001,construction.y),0.,1.);
        float visible=step(construction.z+.000001,progress),fraction=clamp((progress-construction.z)/max(.000001,construction.w-construction.z),0.,1.);
        vec2 turn=rotations[int(stroke.x+.1)],a=project(start,turn),b=project(mix(start,end,fraction),turn),p=mix(a,b,stroke.y);
        vec2 tangent=length(b-a)>.00001?normalize(b-a):vec2(1.,0.),normal=vec2(-tangent.y,tangent.x),other=stroke.y<.5?a-project(previous,turn):project(next,turn)-b;
        vec2 miter=normal;if(length(other)>.0001){vec2 t=normalize(other),n=vec2(-t.y,t.x);miter=normalize(normal+n);miter/=max(.333333,abs(dot(miter,normal)));}
        float inkScale=sqrt(stretch.x*stretch.y);halfWidth=stroke.w*zoom*.5*inkScale;softness=blur*zoom*inkScale;float extent=halfWidth+max(1.,softness*3.);p+=(softness>0.?normal:miter)*stroke.z*extent;
        lineLength=length(b-a);distanceAlong=stroke.y*lineLength;if(softness>0.){float extend=softness*3.;p+=tangent*(stroke.y*2.-1.)*extend;distanceAlong+=(stroke.y*2.-1.)*extend;}
        gl_Position=vec4(p.x/viewport.x*2.-1.,1.-p.y/viewport.y*2.,0.,1.);distanceAcross=stroke.z*extent;
        float near=anchor.z<.5?1.:.875+.125*(anchor.y*turn.x+anchor.x*turn.y)/max(.001,length(anchor.xy));float age=time-lead-activation.y,power=1.;
        if(activation.x>.5&&activation.x<1.5)power=smoothstep(0.,.48,age);
        if(activation.x>1.5&&activation.x<2.5)power=.36+.64*smoothstep(0.,.50,age);
        if(activation.x>2.5)power=pow(sin(3.14159265*clamp(age/.60,0.,1.)),2.);
        float fadeAt=extinguish+(1.-clamp(activation.z/310.,0.,1.))*1.4;
        light=vec4(pigment.rgb,pigment.a*near*visible*power*(1.-smoothstep(fadeAt,fadeAt+.72,time)));
      }`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;in vec4 light;in float distanceAcross;in float halfWidth;in float softness;in float distanceAlong;in float lineLength;out vec4 color;
      float erf(float x){float s=sign(x);x=abs(x);float t=1./(1.+.3275911*x);return s*(1.-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*exp(-x*x));}
      void main(){float coverage=clamp(halfWidth+.5-abs(distanceAcross),0.,1.);if(softness>0.){float k=1.41421356*softness;coverage=.25*(erf((distanceAcross+halfWidth)/k)-erf((distanceAcross-halfWidth)/k))*(erf(distanceAlong/k)-erf((distanceAlong-lineLength)/k));}float a=light.a*coverage;color=vec4(light.rgb*a,a);}`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const floats=31;
    for(const [name,size,offset]of[['start',3,0],['end',3,3],['previous',3,6],['next',3,9],['pigment',4,12],['stroke',4,16],['anchor',3,20],['blur',1,23],['construction',4,24],['activation',3,28]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,floats*4,offset*4);}
    const u=Object.fromEntries(['time','lead','extinguish','rotations','origin','viewport','stretch','zoom','slope','depth','aspect','camera'].map(k=>[k,gl.getUniformLocation(program,k==='rotations'?'rotations[0]':k)]));let ranges=null;
    function prepare(records){
      const along=(path,q)=>{if(!path)return 0;let best=Infinity,result=0,offset=0;for(let i=0;i<path.points.length-1;i++){const a=path.points[i],b=path.points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],length=path.lengths[i],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(length*length||1))),distance=(q[0]-a[0]-dx*t)**2+(q[1]-a[1]-dy*t)**2;if(distance<best){best=distance;result=offset+t*length;}offset+=length;}return result/(path.length||1);};
      const vertices=[],groups=new Map(),colors=new Map();
      const rgb=color=>{if(!colors.has(color)){const v=color.startsWith('#')?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)):color.match(/[\d.]+/g).slice(0,3).map(Number);colors.set(color,v.map(n=>n/255));}return colors.get(color);};
      // Keep each G cutout / ink pass in order. Settled ring light can share a
      // GPU submission, retaining all original world endpoints and colours.
      let previousG=null;for(const record of records){let group;
        if(record.g&&previousG?.op===record.op)group=previousG;
        else{const key=record.g?'g'+record.order:record.blur?'bloom':record.op;group=groups.get(key);if(!group){group={op:record.op,records:[]};groups.set(key,group);}}
        group.records.push(record);if(record.g)previousG=group;}
      const passes=[...groups.values()].filter(g=>g.records[0].blur).concat([...groups.values()].filter(g=>!g.records[0].g&&!g.records[0].blur).sort((a,b)=>(a.op==='lighter')-(b.op==='lighter')),[...groups.values()].filter(g=>g.records[0].g));ranges=[];
      for(const group of passes){const first=vertices.length/floats;
        for(const r of group.records){const color=rgb(r.color),p=r.points,shape=r.path?.points||p,radius=shape.reduce((sum,q)=>sum+Math.hypot(q[0],q[1]),0)/shape.length;
          for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];if(Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])<1e-7)continue;const before=p[Math.max(0,i-1)],after=p[Math.min(p.length-1,i+2)],construction=r.path?[r.path.start,r.path.dur,along(r.path,a),along(r.path,b)]:[-10,1,0,1];
            for(const [end,side]of [[0,-1],[0,1],[1,-1],[1,-1],[0,1],[1,1]])vertices.push(...a,...b,...before,...after,...color,r.alpha,r.layer,end,side,r.width,...r.anchor,r.blur||0,...construction,...(r.power||[0,0]),radius);}
        }ranges.push({first,count:vertices.length/floats-first,op:group.op});}
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    }
    return {hide(){surface.style.display='none';},invalidate(){ranges=null;},draw(ctx,view,build){
      if(!ranges)prepare(build());surface.style.display='block';const{w,h,ox,oy,scale,cfg,transforms}=view;
      if(surface.width!==w)surface.width=w;if(surface.height!==h)surface.height=h;gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.enable(gl.BLEND);
      gl.uniform1f(u.time,view.time);gl.uniform1f(u.lead,view.lead);gl.uniform1f(u.extinguish,view.extinguish);gl.uniform2f(u.stretch,...view.stretch);gl.uniform2fv(u.rotations,new Float32Array([...transforms.inner,...transforms.outer,...transforms.sky,1,0]));gl.uniform2f(u.origin,ox,oy);gl.uniform2f(u.viewport,w,h);gl.uniform1f(u.zoom,scale);gl.uniform1f(u.slope,Math.sin(cfg.cameraTilt));gl.uniform1f(u.depth,Math.cos(cfg.cameraTilt));gl.uniform1f(u.aspect,cfg.cameraAspect);gl.uniform1f(u.camera,cfg.cameraDistance);
      for(const range of ranges){gl.blendFunc(gl.ONE,range.op==='lighter'?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,range.first,range.count);}
    }};
  };
})();
