import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
export function installerUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('INVALID_INSTALLER_URL');return url.href;}
export async function streamInstaller(body,response){
 try{await pipeline(Readable.fromWeb(body),response);return true;}
 catch{if(!response.destroyed)response.destroy();return false;}
}
