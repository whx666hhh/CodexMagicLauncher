'use strict';
// Reference positions describe the drawing order, never wall-clock deadlines.
class AdaptiveLaunchClock {
  constructor({windowAt=16.5,contentAt=22.35,releaseAt=24,duration=32,stagedUntil=0}={}) {
    if(![windowAt,contentAt,releaseAt,duration,stagedUntil].every(Number.isFinite)||!(windowAt>2.4&&contentAt>windowAt&&releaseAt>contentAt&&duration>releaseAt&&stagedUntil>=0&&stagedUntil<windowAt))throw Error('Invalid adaptive sequence');
    Object.assign(this,{windowAt,contentAt,releaseAt,duration,stagedUntil,now:0,time:0,rate:.45,motionOffset:0,readyAt:null});
  }
  ready(now){if(this.readyAt!==null)return;this.frame(now);this.readyAt=now;}
  frame(now){
    if(!Number.isFinite(now)||now<0||now<this.now-1e-8)throw Error('Invalid adaptive time');
    while(this.now<now-1e-9){
      const dt=Math.min(1/120,now-this.now),gap=Math.max(0,this.windowAt-this.time);
      // Readiness opens the handoff gate; it never speeds up the artwork.
      let target=.65;
      if(this.time<2.4)target=.45;
      else if(this.time<this.stagedUntil)target=.60;
      else if(this.time>=this.releaseAt)target=.80;
      else if(this.time>=this.contentAt)target=.65;
      else if(this.time>=this.windowAt)target=.70;
      if(this.readyAt===null)target*=Math.min(1,gap/2.5);
      const next=this.rate+(target-this.rate)*(1-Math.exp(-dt*2.8));
      let advance=(this.rate+next)*.5*dt;
      if(this.readyAt===null)advance=Math.min(advance,gap);
      advance=Math.min(advance,this.duration-this.time);
      if(this.readyAt===null&&gap<3)this.motionOffset+=Math.max(0,dt-advance);
      this.time+=advance;this.rate=next;this.now+=dt;
    }
    const waiting=this.readyAt===null&&this.windowAt-this.time<1.5;
    return {time:this.time,rate:this.rate,waiting,motionTime:this.time+this.motionOffset,motionOffset:this.motionOffset,ambientTime:now,ready:this.readyAt!==null,done:this.time>=this.duration-1e-7};
  }
}
if(typeof module!=='undefined')module.exports={AdaptiveLaunchClock};else window.AdaptiveLaunchClock=AdaptiveLaunchClock;
