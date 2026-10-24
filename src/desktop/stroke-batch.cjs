'use strict';
// Fine strokes are disjoint short runs. Group neighbouring light levels so
// Canvas does not issue a separate stroke call for every engraving fragment.
const microstrokeGroups=new WeakMap();
function strokeCoreBatch(ctx,runs,project,width,color,alpha){
  let groups=microstrokeGroups.get(runs);
  if(!groups){
    groups=new Map();for(const run of runs){const level=Math.round(run.alpha*32);let group=groups.get(level);if(!group){group=[];groups.set(level,group);}group.push(run);}
    microstrokeGroups.set(runs,groups);
  }
  ctx.strokeStyle=color;ctx.lineWidth=width;
  for(const [level,group]of groups){
    ctx.globalAlpha=alpha*level/32;ctx.beginPath();
    for(const run of group){const a=project(run.points[0]),b=project(run.points[1]);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
    ctx.stroke();
  }
}
if(typeof module!=='undefined')module.exports={strokeCoreBatch};else window.strokeCoreBatch=strokeCoreBatch;
