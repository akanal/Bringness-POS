const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('posUpdate',{run:action=>ipcRenderer.invoke('pos-update:action',action),updated:callback=>ipcRenderer.on('pos-update:status',(_,state)=>callback(state))});
