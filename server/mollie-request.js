// Never forward platform credentials through a redirect or an unbounded response.
export async function mollieFetch(url,options={},fetcher=fetch){
 const target=new URL(url);if(target.origin!=='https://api.mollie.com'||!target.pathname.startsWith('/v2/')||target.username||target.password||target.hash)throw Error('INVALID_MOLLIE_ENDPOINT');
 const response=await fetcher(target.href,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 const chunks=[];let size=0;for await(const chunk of response.body||[]){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>1024*1024)throw Error('MOLLIE_RESPONSE_TOO_LARGE');chunks.push(bytes);}
 const raw=Buffer.concat(chunks);return {ok:response.ok,status:response.status,headers:response.headers,json:async()=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))};
}
