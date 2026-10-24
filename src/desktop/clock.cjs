'use strict';
// The visual hold is bounded by readiness; the casting motion keeps its own clock.
class LaunchClock {
  constructor({holdAt=4.15,duration=12.8052}={}){if(!Number.isFinite(holdAt)||!Number.isFinite(duration)||holdAt<0||duration<=holdAt)throw Error('Invalid sequence');this.readyAt=null;this.holdAt=holdAt;this.duration=duration;}
  ready(now){if(!Number.isFinite(now)||now<0)throw Error('Invalid readiness time');if(this.readyAt===null)this.readyAt=now;}
  frame(now){
    if(!Number.isFinite(now)||now<0)throw Error('Invalid animation time');
    const wait=Math.max(0,(this.readyAt===null?now:Math.min(now,this.readyAt))-this.holdAt);
    const time=now-wait,waiting=this.readyAt===null&&now>=this.holdAt;
    return{time,waiting,wait,motionTime:now,completeAt:this.duration+wait,done:time>=this.duration};
  }
}
if(typeof module!=='undefined')module.exports={LaunchClock};else window.LaunchClock=LaunchClock;
