const{test}=require('node:test'),assert=require('node:assert/strict'),{strokeCoreBatch}=require('../src/desktop/stroke-batch.cjs');
test('all engraving fragments survive batching with bounded light error and fewer draw calls',()=>{
 const runs=Array.from({length:400},(_,i)=>({points:[[i,2],[i+.76,3]],alpha:.2+(i%100)/100*.43}));
 const segments=[];let start,strokes=0;
 const ctx={beginPath(){},moveTo(x,y){start=[x,y]},lineTo(x,y){segments.push({a:start,b:[x,y],alpha:this.globalAlpha})},stroke(){strokes++}};
 strokeCoreBatch(ctx,runs,p=>p,1,'#abc',.8);
 assert.equal(segments.length,runs.length);assert(strokes<16,'Detailed strokes should share a small number of draw calls');
 for(const s of segments){const run=runs[s.a[0]];assert.deepEqual(s.a,run.points[0]);assert.deepEqual(s.b,run.points[1]);assert(Math.abs(s.alpha/.8-run.alpha)<=1/64+1e-9);}
});
