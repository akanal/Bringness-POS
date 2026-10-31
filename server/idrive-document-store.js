import crypto from 'node:crypto';
const endpoint='https://s3.eu-central-1.idrivee2.com',region='eu-central-1',bucket='bringness-documents';
const invalid=()=>Object.assign(Error('DOCUMENT_STORAGE_UNAVAILABLE'),{code:'DOCUMENT_STORAGE_UNAVAILABLE'});
export const documentMaxBytes=5*1024*1024;
export function documentObjectKey(company,id,sha){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 if(!uuid.test(company)||!uuid.test(id)||!/^[a-f0-9]{64}$/.test(sha))throw invalid();
 return `documents/accounts/${company}/${id}/${sha}`;
}
export function createIdriveDocumentStore({client,PutObjectCommand,GetObjectCommand,GetBucketPolicyCommand,objectKey=documentObjectKey}){
 async function ensurePrivate(){try{await client.send(new GetBucketPolicyCommand({Bucket:bucket}),{abortSignal:AbortSignal.timeout(15000)});}catch(error){if(error?.name==='NoSuchBucketPolicy'&&error?.$metadata?.httpStatusCode===404)return;throw invalid();}throw invalid();}
 async function getExact({company,id,sha,requestDigest,size,mime}){
  const key=objectKey(company,id,sha);let response;
  try{
   response=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});
   if(response.ServerSideEncryption!=='AES256'||response.ContentLength!==size||response.ContentType!==mime||response.Metadata?.sha256!==sha||response.Metadata?.['request-sha256']!==requestDigest)throw invalid();
   const chunks=[];let length=0;
   for await(const part of response.Body){const chunk=Buffer.from(part);length+=chunk.length;if(length>size||length>documentMaxBytes)throw invalid();chunks.push(chunk);}
   const bytes=Buffer.concat(chunks,length);if(length!==size||crypto.createHash('sha256').update(bytes).digest('hex')!==sha)throw invalid();return bytes;
  }catch{throw invalid();}finally{response?.Body?.destroy?.();}
 }
 return {
  async putExact(record,bytes){
   await ensurePrivate();const key=objectKey(record.company,record.id,record.sha);
   try{await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentLength:bytes.length,ContentType:record.mime,IfNoneMatch:'*',ServerSideEncryption:'AES256',Metadata:{sha256:record.sha,'request-sha256':record.requestDigest}}),{abortSignal:AbortSignal.timeout(15000)});}
   catch(error){if(error?.$metadata?.httpStatusCode!==412)throw invalid();}
   const stored=await getExact(record);if(!stored.equals(bytes))throw invalid();
  },
  async getExact(record){await ensurePrivate();return getExact(record);},
  close(){client.destroy?.();}
 };
}
export async function configuredIdriveDocumentStore(env=process.env,{objectKey=documentObjectKey}={}){
 if(env.SHOP_DOCUMENT_STORAGE!=='idrive')return null;
 const access=env.SHOP_IDRIVE_ACCESS_KEY_ID,secret=env.SHOP_IDRIVE_SECRET_ACCESS_KEY;
 if(typeof access!=='string'||!/^[A-Za-z0-9_-]{12,128}$/.test(access)||typeof secret!=='string'||!/^[A-Za-z0-9/+=_-]{16,256}$/.test(secret))throw invalid();
 const {S3Client,PutObjectCommand,GetObjectCommand,GetBucketPolicyCommand}=await import('@aws-sdk/client-s3');const {NodeHttpHandler}=await import('@smithy/node-http-handler');
 const client=new S3Client({endpoint,region,credentials:{accessKeyId:access,secretAccessKey:secret},forcePathStyle:true,maxAttempts:1,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',requestHandler:new NodeHttpHandler({connectionTimeout:5000,requestTimeout:15000})});
 return createIdriveDocumentStore({client,PutObjectCommand,GetObjectCommand,GetBucketPolicyCommand,objectKey});
}
