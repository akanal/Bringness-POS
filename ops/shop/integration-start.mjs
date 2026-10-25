import crypto from 'node:crypto';
export const productionReference=Object.freeze({commit:'1da9637b77ffb1589f0957f152b1720af9c399ea',startBlob:'5c536d9e056c9d3d22df3724cab85e8f38cfc107'});
export const gitBlob=text=>{const bytes=Buffer.from(text);return crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');};
export function insertShopHooks(source){
 if(source.includes('createShopRuntime')||source.includes('shopRuntime'))throw Error('SHOP_HOOK_ALREADY_PRESENT');
 const replacements=[
  ['const handlePlatformAiGateway=createPlatformAiGateway(platformGatewayPool);',"const shopRuntime=createShopRuntime(platformGatewayPool,{enabled:appMode!=='ai'&&process.env.SHOP_DRAFTS_ENABLED==='true'});\nconst handlePlatformAiGateway=createPlatformAiGateway(platformGatewayPool);"],
  ['      if (await handleTableSettlement(req,res)) return;',"      if (await shopRuntime.handle(req,res)) return;\n      if (await handleTableSettlement(req,res)) return;"],
  ['      await migrateStaffInvitations();',"      await migrateStaffInvitations();\n      try{await shopRuntime.migrate();}catch{console.error('Shop migrations unavailable; shop routes remain closed.');}"]
 ];
 for(const [anchor]of replacements)if(source.split(anchor).length!==2)throw Error('INTEGRATION_ANCHOR_CHANGED');
 let result="import {createShopRuntime} from './shop-http.js';\n"+source;for(const [anchor,value]of replacements)result=result.replace(anchor,value);return result;
}
export function prepareShopStartup(source){
 if(gitBlob(source)!==productionReference.startBlob)throw Error('PRODUCTION_SOURCE_CHANGED');
 return protectShopBrandInjection(insertShopHooks(source));
}

export function insertShopRegistrationHooks(source){
 if(source.includes('shopRegistrationRuntime')||source.includes('createShopRegistrationRuntime'))throw Error('REGISTRATION_HOOK_ALREADY_PRESENT');
 const safeFactory=`let shopRegistrationRuntime={migrate:async()=>{},handle:async()=>false};
if(appMode!=='ai'&&process.env.SHOP_REGISTRATION_ENABLED==='true'){
  try{shopRegistrationRuntime=createShopRegistrationRuntime(platformGatewayPool,{enabled:true,publicOrigin:process.env.PUBLIC_BASE_URL||process.env.PUBLIC_URL});}
  catch{console.error('Shop registration configuration unavailable; registration remains closed.');}
}
`;
 const replacements=[
  ["const shopRuntime=createShopRuntime(platformGatewayPool,{enabled:appMode!=='ai'&&process.env.SHOP_DRAFTS_ENABLED==='true'});",safeFactory+"const shopRuntime=createShopRuntime(platformGatewayPool,{enabled:appMode!=='ai'&&process.env.SHOP_DRAFTS_ENABLED==='true'});"],
  ['      if (await shopRuntime.handle(req,res)) return;','      if (await shopRegistrationRuntime.handle(req,res)) return;\n      if (await shopRuntime.handle(req,res)) return;'],
  ["      try{await shopRuntime.migrate();}catch{console.error('Shop migrations unavailable; shop routes remain closed.');}","      try{await shopRuntime.migrate();}catch{console.error('Shop migrations unavailable; shop routes remain closed.');}\n      try{await shopRegistrationRuntime.migrate();}catch{console.error('Shop registration migrations unavailable; registration remains closed.');}"]
 ];
 for(const [anchor]of replacements)if(source.split(anchor).length!==2)throw Error('REGISTRATION_INTEGRATION_ANCHOR_CHANGED');
 let result="import {createShopRegistrationRuntime} from './shop-registration-http.js';\n"+source;for(const [anchor,value]of replacements)result=result.replace(anchor,value);return result;
}
export function prepareShopRegistrationStartup(source){return insertShopRegistrationHooks(prepareShopStartup(source));}

export const brandInjectionAnchor = `      if (!normalized.includes('/ai') && !html.includes('/brand-logo.js')) html = html.replace("</head>", '<script src="/brand-logo.js"></script></head>');`;
export function protectShopBrandInjection(source){
 const guard="!normalized.includes('/apps/web/public/shop/')";
 if(source.includes(guard))throw Error('SHOP_BRAND_GUARD_ALREADY_PRESENT');
 if(source.split(brandInjectionAnchor).length!==2)throw Error('SHOP_BRAND_ANCHOR_CHANGED');
 return source.replace(brandInjectionAnchor,brandInjectionAnchor.replace("!normalized.includes('/ai')", "!normalized.includes('/ai') && "+guard));
}
