import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {isBuiltin} from 'node:module';
import {fileURLToPath} from 'node:url';
const defaults=['server/shop-http.js','server/shop-registration-http.js'];
const fail=code=>Object.assign(Error(code),{code});
const portable=value=>typeof value==='string'&&value.length>0&&!value.includes('\\')&&!value.includes('\0')&&!value.includes('?')&&!value.includes('#')&&!path.posix.isAbsolute(value)&&!value.split('/').includes('..')&&path.posix.normalize(value)===value;
export async function collectShopSourceInventory({root=fileURLToPath(new URL('../../',import.meta.url)),entries=defaults}={}){
 if(typeof vm.SourceTextModule!=='function')throw fail('SOURCE_PARSER_UNAVAILABLE');
 if(!Array.isArray(entries)||!entries.length||entries.some(p=>!portable(p)))throw fail('INVALID_SOURCE_ENTRY');
 const base=await realpath(root),visited=new Set(),files=[],builtins=new Set();let totalBytes=0;
 const read=async relative=>{
  if(!portable(relative)||!['.js','.mjs'].includes(path.posix.extname(relative)))throw fail('UNSUPPORTED_SOURCE_PATH');
  let current=base;
  for(const component of relative.split('/')){current=path.join(current,component);const stat=await lstat(current);if(stat.isSymbolicLink())throw fail('SOURCE_SYMLINK');}
  const stat=await lstat(current);if(!stat.isFile())throw fail('SOURCE_NOT_FILE');if(stat.size>1048576)throw fail('SOURCE_SIZE_LIMIT');
  return readFile(current);
 };
 async function visit(relative){
  if(visited.has(relative))return;if(visited.size>=256)throw fail('SOURCE_GRAPH_LIMIT');visited.add(relative);
  let bytes;try{bytes=await read(relative);}catch(error){if(error.code?.startsWith('SOURCE_')||error.code==='UNSUPPORTED_SOURCE_PATH')throw error;throw fail('SOURCE_MISSING');}
  totalBytes+=bytes.length;if(totalBytes>8388608)throw fail('SOURCE_SIZE_LIMIT');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail('SOURCE_ENCODING');}
  // This candidate deliberately supports static imports only. No code is evaluated.
  if(/\bimport(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*\(/.test(text))throw fail('DYNAMIC_IMPORT_REVIEW_REQUIRED');
  let specifiers;try{specifiers=new vm.SourceTextModule(text,{identifier:relative}).dependencySpecifiers;}catch{throw fail('SOURCE_SYNTAX');}
  const imports=[];
  for(const specifier of [...new Set(specifiers)].sort()){
   if(isBuiltin(specifier)){builtins.add(specifier);imports.push({specifier,builtin:true});continue;}
   if(!specifier.startsWith('./')&&!specifier.startsWith('../'))throw fail('PACKAGE_REVIEW_REQUIRED');
   if(/[\\?#\0]/.test(specifier))throw fail('UNSUPPORTED_SOURCE_PATH');
   const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(relative),specifier));
   if(!portable(dependency))throw fail('SOURCE_OUTSIDE_ROOT');
   imports.push({specifier,path:dependency});await visit(dependency);
  }
  const gitBlob=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  files.push({path:relative,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),gitBlob,kind:relative.startsWith('server/shop-')||relative.startsWith('apps/web/public/shop/')?'shop-candidate':'shared-review-required',imports});
 }
 for(const entry of [...new Set(entries)].sort())await visit(entry);
 return {version:1,scope:'static-startup-imports-only',canDeploy:false,entries:[...new Set(entries)].sort(),builtins:[...builtins].sort(),files:files.sort((a,b)=>a.path.localeCompare(b.path,'en'))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);if(args.length>2)throw fail('INVALID_SOURCE_ARGUMENTS');
  const result=await collectShopSourceInventory({...(args[0]?{root:args[0]}:{}),...(args[1]?{entries:JSON.parse(args[1])}:{})});process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(error){process.stderr.write((typeof error.code==='string'?error.code:'SOURCE_INVENTORY_UNAVAILABLE')+'\n');process.exitCode=1;}
}
