'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict');
const{LaunchClock}=require('../src/desktop/clock.cjs');
test('a slow skin cannot advance construction or retirement; motion time keeps advancing',()=>{
  const clock=new LaunchClock();assert.equal(clock.frame(3).time,3);
  assert(Math.abs(clock.frame(20).time-4.15)<1e-8);assert(Math.abs(clock.frame(31).time-4.15)<1e-8);
  assert(clock.frame(31).motionTime>clock.frame(20).motionTime);assert.equal(clock.frame(31).done,false);
  clock.ready(32);assert(Math.abs(clock.frame(32).time-4.15)<1e-8);assert(Math.abs(clock.frame(35).time-7.15)<1e-8);
  assert.equal(clock.frame(40).done,false);assert.equal(clock.frame(41).done,true);
});
test('an already ready skin preserves the minimum complete animation',()=>{
  const clock=new LaunchClock({duration:13});clock.ready(0);assert.equal(clock.frame(8).done,false);assert.equal(clock.frame(12.99).done,false);assert.equal(clock.frame(13).done,true);
});
test('the renderer can supply its material-driven duration and invalid readiness is rejected',()=>{
  const clock=new LaunchClock({duration:13.5});assert.throws(()=>clock.ready(NaN));assert.throws(()=>clock.frame(-1));clock.ready(2);clock.ready(40);assert.equal(clock.frame(13.5).done,true);
});
