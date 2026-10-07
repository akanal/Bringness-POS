const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('offlinePOS',{view:()=>ipcRenderer.invoke('offline:view'),sale:sale=>ipcRenderer.invoke('offline:sale',sale),online:()=>ipcRenderer.invoke('offline:online'),updated:callback=>ipcRenderer.on('offline:updated',()=>callback())});
