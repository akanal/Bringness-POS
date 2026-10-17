import http from 'node:http';
const request=http.get({host:'127.0.0.1',port:3000,path:'/health',headers:{authorization:'Basic '+Buffer.from(process.env.PREVIEW_ACCESS_USER+':'+process.env.PREVIEW_ACCESS_PASSWORD).toString('base64')}},response=>{response.resume();process.exitCode=response.statusCode===200?0:1;});
request.setTimeout(3000,()=>request.destroy());request.on('error',()=>{process.exitCode=1;});
