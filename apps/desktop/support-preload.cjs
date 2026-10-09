const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bringnessSupport',{stop:()=>ipcRenderer.send('bringness-support-stop'),revoke:()=>ipcRenderer.send('bringness-support-revoke')});
