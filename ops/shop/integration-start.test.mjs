import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {gitBlob,insertShopHooks,prepareShopStartup} from './integration-start.mjs';
const source="import example from './example.js';\nconst handlePlatformAiGateway=createPlatformAiGateway(platformGatewayPool);\nasync function handler(){\n      if (await handleTableSettlement(req,res)) return;\n}\nasync function migrations(){\n      await migrateBillingMail(platformGatewayPool);\n      await migrateStaffInvitations();\n}\n";
test('integration never accepts unverified or already changed production startup',()=>{assert.throws(()=>prepareShopStartup(source),/PRODUCTION_SOURCE_CHANGED/);assert.throws(()=>insertShopHooks(source+'\nconst shopRuntime={}'),/SHOP_HOOK_ALREADY_PRESENT/);});
test('additive integration preserves existing handlers and migrates only after billing',()=>{
 const output=insertShopHooks(source);assert.ok(output.includes("SHOP_DRAFTS_ENABLED==='true'"));assert.ok(output.includes("appMode!=='ai'"));assert.ok(output.indexOf('await shopRuntime.migrate()')>output.indexOf('await migrateBillingMail('));assert.match(output,/try\{await shopRuntime.migrate\(\);\}catch/);assert.equal(output.includes('processShopTestPayment'),false);assert.equal(output.includes('createShopTestWebhook'),false);
 const restored=output.replace("import {createShopRuntime} from './shop-http.js';\n",'').replace("const shopRuntime=createShopRuntime(platformGatewayPool,{enabled:appMode!=='ai'&&process.env.SHOP_DRAFTS_ENABLED==='true'});\n",'').replace('      if (await shopRuntime.handle(req,res)) return;\n','').replace("\n      try{await shopRuntime.migrate();}catch{console.error('Shop migrations unavailable; shop routes remain closed.');}",'');assert.equal(restored,source);
});
test('ambiguous integration anchors are rejected before a candidate can be produced',()=>{assert.throws(()=>insertShopHooks(source.replace('await migrateStaffInvitations();','changed();')),/INTEGRATION_ANCHOR_CHANGED/);assert.throws(()=>insertShopHooks(source+'\n      await migrateStaffInvitations();'),/INTEGRATION_ANCHOR_CHANGED/);});
test('shared dependency bytes still match the inspected pinned GitHub revision',async()=>{
 const reference=JSON.parse(await readFile(new URL('./production-reference.json',import.meta.url)));assert.equal(reference.deployedRevisionVerified,false);
 for(const [path,sha]of Object.entries(reference.matchingSharedImports))assert.equal(gitBlob(await readFile(new URL('../../'+path,import.meta.url),'utf8')),sha,path);
});
