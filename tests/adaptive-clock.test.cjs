'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict');
const{AdaptiveLaunchClock}=require('../src/desktop/adaptive-clock.cjs');
function completed(readyAt){const c=new AdaptiveLaunchClock();let last=0;for(let t=0;t<100;t+=.05){if(c.readyAt===null&&t>=readyAt)c.ready(t);const f=c.frame(t);assert(f.time>=last);last=f.time;if(f.done)return t;}throw Error('did not finish');}
test('early readiness cannot accelerate the artwork and late readiness extends the wait',()=>{const fast=completed(0),normal=completed(9),slow=completed(55);assert(fast>40&&fast<60);assert(Math.abs(normal-fast)<.1);assert(slow>55&&slow<85);});
test('desktop absorption has over five seconds and later details keep their calm speed',()=>{const c=new AdaptiveLaunchClock();c.ready(0);assert(c.frame(5).time<2.4);let start=null,end=null;for(let t=5;t<90;t+=.02){const f=c.frame(t);if(start===null&&f.time>=24)start=t;if(end===null&&f.done)end=t;}assert(end-start>9);});
test('unready window never receives construction, content or retirement, while motion remains alive',()=>{const c=new AdaptiveLaunchClock();const a=c.frame(30),b=c.frame(90);assert(a.time<=c.windowAt&&b.time<=c.windowAt);assert(b.waiting&&!b.done);assert(b.motionTime>a.motionTime+50);});
test('ready signal resumes continuously and duplicate signals cannot restart the sequence',()=>{const c=new AdaptiveLaunchClock();const a=c.frame(35);c.ready(35);assert.equal(c.frame(35).time,a.time);const b=c.frame(35.02);assert(b.time-a.time<.005);c.ready(80);assert.equal(c.readyAt,35);assert(c.frame(36).time>b.time);});
test('frame sampling does not change the phase trajectory materially',()=>{const a=new AdaptiveLaunchClock(),b=new AdaptiveLaunchClock();a.ready(8);b.ready(8);for(let t=8;t<18;t+=1/30)a.frame(t);for(let t=8;t<18;t+=1/144)b.frame(t);assert(Math.abs(a.frame(18).time-b.frame(18).time)<.005);});
test('bad clocks and reference order fail closed',()=>{assert.throws(()=>new AdaptiveLaunchClock({windowAt:24}));const c=new AdaptiveLaunchClock();assert.throws(()=>c.frame(NaN));c.frame(4);assert.throws(()=>c.frame(3));});
test('staged introduction retains its speed cap and shifted readiness gates',()=>{
  const options={windowAt:22.94,contentAt:27.42,releaseAt:29.07,duration:37.07,stagedUntil:14.12};
  const c=new AdaptiveLaunchClock(options);c.ready(0);let complete=false;
  for(let t=0;t<90;t+=.05){const f=c.frame(t);if(f.time>5&&f.time<options.stagedUntil)assert(f.rate<.61);if(f.done){complete=true;assert.equal(f.time,options.duration);break;}}
  assert(complete);const delayed=new AdaptiveLaunchClock(options);assert(delayed.frame(35).time<=options.windowAt);delayed.ready(35);assert(!delayed.frame(35).done);
  assert.throws(()=>new AdaptiveLaunchClock({...options,stagedUntil:options.windowAt}));
});
