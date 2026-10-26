import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {fixture} from './fixture.mjs';import {migrateSellerDrafts,writeSellerDraft,readSellerDraft} from '../../server/shop-seller-drafts.js';
const offer={title:'Private fixture',category:'Software',kind:'digital',price:'10',tax:'19',stock:'',gtin:'',condition:'new',sku:'',description:'Private description',delivery:'',fulfilment:'Download'};
test('private paused/sold notes persist with immutable identity, replay and account isolation; restoring editing never publishes',async()=>{
 const f=await fixture();try{await migrateSellerDrafts(f.pool);const id='offer-'+crypto.randomUUID();let revision=0,listingNumber;
 for(const workflow of ['paused','sold','draft']){const command={id,requestId:crypto.randomUUID(),expectedRevision:revision,action:'save',offer:{...offer,workflow}},result=await writeSellerDraft(f.pool,{token:'owner-a',command});revision=result.revision;listingNumber??=result.listingNumber;assert.equal(result.listingNumber,listingNumber);assert.equal(result.offer.workflow,workflow==='draft'?undefined:workflow);assert.equal(result.canPublish,false);assert.equal((await writeSellerDraft(f.pool,{token:'owner-a',command})).replay,true);assert.equal(result.state,'draft');}
 await assert.rejects(()=>readSellerDraft(f.pool,{token:'owner-b',id}),e=>e.code==='OFFER_NOT_FOUND');assert.equal((await f.db.query('SELECT * FROM billing_transactions')).rows.length,0);
 }finally{await f.db.close();}
});
