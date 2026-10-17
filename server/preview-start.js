// Explicit isolated entrypoint. Normal production startup never imports this file.
import http from 'node:http';
import {validatePreviewEnvironment,createPreviewAccess,blockedPreviewFetch,markPreviewRuntimeInstalled} from './preview-policy.js';
const policy=validatePreviewEnvironment();
const access=createPreviewAccess(policy),originalCreateServer=http.createServer;
http.createServer=function(options,listener){
 if(typeof options==='function'){listener=options;options=undefined;}
 if(typeof listener!=='function')throw Error('Preview requires an HTTP request listener');
 const guarded=(req,res)=>{if(!access(req,res))return listener(req,res);};
 return options?originalCreateServer.call(http,options,guarded):originalCreateServer.call(http,guarded);
};
// This application-level fence supplements the Compose internal network. It is
// installed before application modules can start provider or weather requests.
globalThis.fetch=async()=>blockedPreviewFetch();
markPreviewRuntimeInstalled();
await import('./start.js');
