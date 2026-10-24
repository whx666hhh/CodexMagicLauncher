'use strict';
const{contextBridge,ipcRenderer}=require('electron');
const config=ipcRenderer.sendSync('magic-config');
const pointerListeners=[];
ipcRenderer.on('magic-pointer',(_event,value)=>{for(const callback of pointerListeners)callback(value);});
let ready=config?.ready===true;const listeners=[];
let layout=config?.layout;const layoutListeners=[];
ipcRenderer.on('magic-layout',(_event,value)=>{layout=value;for(const callback of layoutListeners)callback(value);});
ipcRenderer.on('magic-ready',()=>{ready=true;for(const callback of listeners)callback();});
contextBridge.exposeInMainWorld('codexMagic',{
  config,
  pointer:callback=>pointerListeners.push(callback),
  ready:callback=>{listeners.push(callback);if(ready)callback();},
  layout:callback=>{layoutListeners.push(callback);if(layout)callback(layout);},
  start:callback=>ipcRenderer.once('magic-start',()=>callback()),
  frame:value=>ipcRenderer.send('magic-frame',value),
  rendered:()=>ipcRenderer.send('magic-rendered'),
  failed:message=>ipcRenderer.send('magic-failed',String(message||'').slice(0,200))
});
