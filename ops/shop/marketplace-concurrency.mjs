import assert from 'node:assert/strict';import crypto from 'node:crypto';
export async function marketplaceConcurrencyChecks({base,pool,sellerToken,buyerToken}){
 const post=async(path,c,token)=>{const r=await fetch(base+'/api/v1/shop/'+path,{method:'POST',headers:{Origin:'https://bringness.de','Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(c)});return {status:r.status,value:await r.json()};};
 const id='offer-'+crypto.randomUUID(),offer={title:'CI last piece',category:'Hardware',kind:'physical',price:'1,00',tax:'19',stock:'1',gtin:'',condition:'new',sku:'LAST',description:'Concurrent disposable fixture.',delivery:'Nur Abholung',fulfilment:''};
 assert.equal((await post('seller/offers',{id,requestId:crypto.randomUUID(),action:'save',expectedRevision:0,offer},sellerToken)).status,200);
 assert.equal((await post('marketplace/publish',{id,requestId:crypto.randomUUID(),action:'publish',expectedRevision:0,sourceRevision:1,publication:{variants:[{sku:'LAST',label:'Letztes Stück',netCents:100,vatBasisPoints:1900,stock:1}],shipping:false,pickup:true,shippingNetCents:0,shippingVatBasisPoints:1900,delivery:'',pickupAddress:'CI only'}},sellerToken)).status,200);
 const command={requestId:crypto.randomUUID(),lines:[{id,revision:1,sku:'LAST',quantity:1,unitNetCents:100}],method:'pickup',shippingNetCents:0,recipient:{name:'CI Buyer',street:'Testweg 2',postalCode:'10115',city:'Berlin',country:'DE',email:'ci@example.test'}};
 // Separate company locks force the decisive publication-row lock to arbitrate stock.
 const buyers=await Promise.all([post('marketplace/orders',command,buyerToken),post('marketplace/orders',{...command,requestId:crypto.randomUUID()},sellerToken)]);
 assert.deepEqual(buyers.map(x=>x.status).sort(),[200,409]);const winner=buyers.find(x=>x.status===200);assert.equal(winner.value.grossCents,119);const row=(await pool.query('SELECT document,revision FROM shop_market_publications WHERE id=$1',[id])).rows[0];assert.equal(row.document.variants[0].stock,0);assert.equal(row.revision,2);
 const winningToken=buyers[0].status===200?buyerToken:sellerToken,winningCommand=buyers[0].status===200?command:{...command,requestId:winner.value.requestId};
 const repeated=await Promise.all([post('marketplace/orders',winningCommand,winningToken),post('marketplace/orders',winningCommand,winningToken)]);assert.deepEqual(repeated.map(r=>r.status),[200,200]);assert.ok(repeated.every(r=>r.value.orderId===winner.value.orderId&&r.value.replay));assert.equal((await pool.query('SELECT document FROM shop_market_publications WHERE id=$1',[id])).rows[0].document.variants[0].stock,0);
 const cancel={requestId:crypto.randomUUID(),orderId:winner.value.orderId,action:'cancel',expectedRevision:0};
 const cancelled=await Promise.all([post('marketplace/order-status',cancel,sellerToken),post('marketplace/order-status',cancel,sellerToken)]);
 assert.deepEqual(cancelled.map(r=>r.status),[200,200]);assert.equal(cancelled.filter(r=>r.value.replay).length,1);assert.equal((await pool.query('SELECT document FROM shop_market_publications WHERE id=$1',[id])).rows[0].document.variants[0].stock,1);
 assert.equal(Number((await pool.query('SELECT count(*) n FROM shop_market_order_events WHERE order_id=$1',[winner.value.orderId])).rows[0].n),1);
 const stale=await post('marketplace/order-status',{...cancel,requestId:crypto.randomUUID()},sellerToken);assert.equal(stale.status,409);

 // Real PostgreSQL serializes identical and competing tracking corrections.
 const shippingId='offer-'+crypto.randomUUID(),shippingOffer={...offer,title:'CI concurrent shipping',stock:'2',sku:'TRACK',delivery:'Synthetic shipping'};
 assert.equal((await post('seller/offers',{id:shippingId,requestId:crypto.randomUUID(),action:'save',expectedRevision:0,offer:shippingOffer},sellerToken)).status,200);
 assert.equal((await post('marketplace/publish',{id:shippingId,requestId:crypto.randomUUID(),action:'publish',expectedRevision:0,sourceRevision:1,publication:{variants:[{sku:'TRACK',label:'Tracking',netCents:100,vatBasisPoints:1900,stock:2}],shipping:true,pickup:false,shippingNetCents:0,shippingVatBasisPoints:1900,delivery:'Synthetic shipping',pickupAddress:''}},sellerToken)).status,200);
 const shippedOrder=await post('marketplace/orders',{requestId:crypto.randomUUID(),lines:[{id:shippingId,revision:1,sku:'TRACK',quantity:1,unitNetCents:100}],method:'shipping',shippingNetCents:0,recipient:command.recipient},buyerToken);assert.equal(shippedOrder.status,200);
 for(const [action,expectedRevision]of [['accept',0],['ship',1]])assert.equal((await post('marketplace/order-status',{requestId:crypto.randomUUID(),orderId:shippedOrder.value.orderId,action,expectedRevision},sellerToken)).status,200);
 const track={requestId:crypto.randomUUID(),orderId:shippedOrder.value.orderId,expectedRevision:0,tracking:{carrier:'dhl',carrierName:'DHL',number:'SYNTHETIC-RACE-123'}};
 const trackingCopies=await Promise.all([post('marketplace/order-tracking',track,sellerToken),post('marketplace/order-tracking',track,sellerToken)]);assert.deepEqual(trackingCopies.map(r=>r.status),[200,200]);assert.equal(trackingCopies.filter(r=>r.value.replay).length,1);
 const corrections=await Promise.all(['LEFT-123','RIGHT-123'].map(number=>post('marketplace/order-tracking',{...track,requestId:crypto.randomUUID(),expectedRevision:1,tracking:{...track.tracking,number}},sellerToken)));assert.deepEqual(corrections.map(r=>r.status).sort(),[200,409]);
 assert.equal(Number((await pool.query('SELECT count(*) n FROM shop_market_tracking_events WHERE order_id=$1',[track.orderId])).rows[0].n),2);assert.equal((await pool.query('SELECT document FROM shop_market_publications WHERE id=$1',[shippingId])).rows[0].document.variants[0].stock,1);assert.equal((await pool.query('SELECT revision FROM shop_market_order_state WHERE order_id=$1',[track.orderId])).rows[0].revision,2);

}
