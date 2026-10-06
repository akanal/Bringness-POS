import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createCenterHandler} from './center-core.js';
const id='11111111-1111-4111-8111-111111111111',code='a'.repeat(48);
const rows=(...rows)=>({rows,rowCount:rows.length});
test('restaurant cannot be enrolled into a second center even concurrently',async()=>{
  const r=await request(async(sql)=>{if(sql.includes('FROM sessions'))return rows({role:'owner',company_id:id});if(sql.startsWith('SELECT'))return rows({id});throw Object.assign(Error('unique restaurant membership'),{code:'23505'});},'/api/v1/centers/'+id+'/restaurants','PUT',{restaurantId:id,active:true},true);assert.equal(r.status,409);
});
test('manual onboarding cannot claim verified payment',async()=>{
  const r=await request(async()=>rows({role:'owner',company_id:id}),'/api/v1/centers/'+id+'/restaurants/'+id+'/onboarding','PUT',{contractStatus:'signed',merchantReference:'org_example',paymentStatus:'verified'},true);assert.equal(r.status,400);
});
test('onboarding update scopes both restaurant and center ownership and invalidates changed merchant reference',async()=>{
  const r=await request(async(sql,args)=>{if(sql.includes('FROM sessions'))return rows({role:'owner',company_id:id});assert.match(sql,/c.company_id=\$3 AND r.company_id=\$3/);assert.match(sql,/IS DISTINCT FROM \$5/);assert.equal(args[4],'org_example');return rows({contract_status:'signed',payment_status:'pending',merchant_reference:'org_example'});},'/api/v1/centers/'+id+'/restaurants/'+id+'/onboarding','PUT',{contractStatus:'signed',merchantReference:'org_example'},true);assert.equal(r.status,200);assert.equal(r.data.orderingAvailable,false);assert.equal(r.data.onboarding.payment_status,'pending');
});
test('onboarding rejects API secrets instead of storing them as merchant references',async()=>{
  const r=await request(async(sql)=>{assert.match(sql,/FROM sessions/);return rows({role:'owner',company_id:id});},'/api/v1/centers/'+id+'/restaurants/'+id+'/onboarding','PUT',{contractStatus:'signed',merchantReference:'live_secret'},true);assert.equal(r.status,400);
});
async function request(query,path,method='GET',payload,auth=false){
  const req=Readable.from(payload?[JSON.stringify(payload)]:[]);Object.assign(req,{url:path,method,headers:auth?{authorization:'Bearer test'}:{}});
  const res={writeHead(status){this.status=status;},end(raw){this.data=JSON.parse(raw);}};
  assert.equal(await createCenterHandler({query})(req,res),true);return res;
}
test('unconfigured center orders cannot create or dispatch an unpaid order',async()=>{
  const r=await request(()=>{throw Error('must not access orders');},'/api/v1/guest/center/order','POST',{items:[{qty:5}]});assert.equal(r.status,503);
});
test('guest menu never exposes a restaurant outside this center',async()=>{
  let n=0;const r=await request(async(sql,args)=>{n++;if(n===1){assert.match(sql,/t.active=true AND c.active=true/);return rows({center_id:id});}assert.match(sql,/cr.center_id=\$1 AND cr.restaurant_id=\$2 AND cr.active=true/);assert.deepEqual(args,[id,id]);return rows();},'/api/v1/guest/center/menu?code='+code+'&restaurantId='+id);assert.equal(r.status,404);assert.equal(n,2);
});
test('invalid public code cannot enumerate centers',async()=>{
  const r=await request(()=>{throw Error('query not allowed');},'/api/v1/guest/center/restaurants?code=invalid');assert.equal(r.status,404);
});
test('unauthenticated center management is denied',async()=>{
  const r=await request(()=>{throw Error('query not allowed');},'/api/v1/centers');assert.equal(r.status,401);
});
test('waiters cannot create centers',async()=>{
  const r=await request(async()=>rows({role:'waiter'}),'/api/v1/centers','POST',{name:'Center'},true);assert.equal(r.status,403);
});
test('owner cannot add another company restaurant',async()=>{
  const r=await request(async(sql,args)=>{if(sql.includes('FROM sessions'))return rows({role:'owner',company_id:id});if(sql.includes('FROM centers'))return rows({id});if(sql.includes('FROM restaurants')){assert.match(sql,/company_id=\$2/);assert.equal(args[1],id);return rows();}throw Error('must not enroll');},'/api/v1/centers/'+id+'/restaurants','PUT',{restaurantId:id,active:true},true);assert.equal(r.status,403);
});
test('guests see only active center memberships and no internal table tokens',async()=>{
  const r=await request(async(sql)=>{if(sql.includes('FROM center_tables'))return rows({center_id:id,center_name:'Center',name:'1'});assert.match(sql,/cr.active=true/);assert.doesNotMatch(sql,/qr_token/);return rows({id,name:'Restaurant'});},'/api/v1/guest/center/restaurants?code='+code);assert.equal(r.status,200);assert.equal(r.data.orderingAvailable,false);assert.equal(r.data.restaurants[0].name,'Restaurant');
});
