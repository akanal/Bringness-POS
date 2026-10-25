import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareLiveShopStartup,prepareLiveShopIndex,livePublicOrigin} from './live-integration.mjs';
test('live transforms refuse unverified original startup and index sources',()=>{assert.throws(()=>prepareLiveShopStartup('arbitrary source'),/PRODUCTION_SOURCE_CHANGED/);assert.throws(()=>prepareLiveShopIndex('arbitrary source'),/LIVE_INDEX_SOURCE_CHANGED/);assert.equal(livePublicOrigin,'https://bringness.de');});
test('explicit live transform changes only catalogue-registration gates and canonical origin',async()=>{const source=await readFile(new URL('./live-integration.mjs',import.meta.url),'utf8');for(const forbidden of ['createShopMollieTestAdapter','fulfilShopLiveDownload','SHOP_DOWNLOAD_FULFILMENT','MOLLIE_API_KEY'])assert.equal(source.includes(forbidden),false);assert.match(source,/SHOP_DRAFTS_ENABLED!==/);assert.match(source,/SHOP_REGISTRATION_ENABLED!==/);});
