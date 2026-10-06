import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeSaleEvent} from './ai-sales-contract.js';

test('sales contract rejects ambiguous IDs and coerced quantities',()=>{
  const sale={eventId:'sale-1',items:[{productCode:'burger',quantity:2}]};
  assert.equal(normalizeSaleEvent(sale).normalized[0].quantity,2);
  for(const value of [true,null,'2',0,-1,0.0001,Infinity])assert.throws(()=>normalizeSaleEvent({...sale,items:[{productCode:'burger',quantity:value}]}));
  for(const eventId of ['',null,42,'x'.repeat(151)])assert.throws(()=>normalizeSaleEvent({...sale,eventId}));
  assert.throws(()=>normalizeSaleEvent({...sale,items:Array(101).fill(sale.items[0])}));
  assert.equal(normalizeSaleEvent({eventId:'reversal-1',type:'reversal',reversesEventId:'sale-1'}).normalized,'sale-1');
});
test('OpenAPI declares every external integration operation and location-bound bearer authentication',()=>{
  const spec=JSON.parse(fs.readFileSync(new URL('../apps/web/public/ai-openapi.json',import.meta.url)));
  for(const path of ['/api/ai/v1/sales','/api/ai/v1/sales/validate','/api/ai/v1/status','/api/ai/v1/products','/api/ai/import/sales'])assert.ok(spec.paths[path]);
  assert.equal(spec.components.securitySchemes.ConnectorKey.scheme,'bearer');
  assert.equal(spec.components.schemas.Sale.properties.items.maxItems,100);
  assert.equal(spec.servers[0].url,'https://bringness-ai.com');
});
