import {uuid,hash} from './ai-policy.js';
import {validDay} from './ai-planning-core.js';
const fail=message=>{throw Object.assign(Error(message),{status:400})};
const identifier=v=>{if(typeof v!=='string'||!uuid.test(v))fail('Gültige Vorgangskennung erforderlich');return v.toLowerCase()};
const reason=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>1000)fail('Begründung mit 1 bis 1000 Zeichen erforderlich');return v.trim()};
// Translate only the supplier-owned subset of the existing fulfilment workflow.
// Approval, receipt, payment and inventory routes are intentionally not mapped.
export function supplierFulfilmentAction(path,body){
 const group=path.match(/^\/api\/ai\/v1\/supplier\/order-groups\/([0-9a-f-]{36})\/(accept|cancel)$/i);
 const order=path.match(/^\/api\/ai\/v1\/supplier\/orders\/([0-9a-f-]{36})\/(unavailable|replacement)$/i);
 if(!group&&!order)return null;
 if(!body||typeof body!=='object'||Array.isArray(body))fail('Rückmeldung erforderlich');
 const action=(group||order)[2].toLowerCase(),target=identifier((group||order)[1]);
 const permitted=['requestId','confirmed',...(action==='accept'?['deliveryDate']:action==='cancel'?['reason']:action==='unavailable'?['reason','pauseProduct']:['reason','productId','packs'])];
 if(Object.keys(body).some(k=>!permitted.includes(k)))fail('Unbekannte Rückmeldungsfelder');
 const requestKey=identifier(body.requestId);if(body.confirmed!==true)fail('Rückmeldung ausdrücklich bestätigen');
 const b={requestKey,confirmed:true};
 if(action==='accept'){if(!validDay(body.deliveryDate))fail('Gültiger bestätigter Liefertermin erforderlich');b.deliveryDate=body.deliveryDate;}
 else b.reason=reason(body.reason);
 if(action==='unavailable'){if(body.pauseProduct!==undefined&&typeof body.pauseProduct!=='boolean')fail('Produktsperre muss boolesch sein');b.orderId=target;b.pauseProduct=body.pauseProduct===true;}
 if(action==='replacement'){b.orderId=target;b.productId=identifier(body.productId);if(!Number.isSafeInteger(body.packs)||body.packs<1||body.packs>10000)fail('Ganze Ersatzpackungen zwischen 1 und 10000 erforderlich');b.packs=body.packs;}
 return {path:group?'/api/ai/order-groups/'+target+'/'+action:'/api/ai/fulfilment/'+(action==='unavailable'?'unavailable':'replacement/propose'),body:b,special:!group};
}

export async function authorizeSupplierConnector(c,link,token){
 if(!(await c.query("SELECT id FROM ai_accounts WHERE id=$1 AND status='active' AND role IN ('dealer','wholesaler','manufacturer') FOR NO KEY UPDATE",[link.supplier_id])).rowCount)denied('Lieferantenkonto nicht mehr freigegeben');
 if(!(await c.query('SELECT id FROM ai_supplier_connectors WHERE id=$1 AND supplier_id=$2 AND token_hash=$3 AND active FOR UPDATE',[link.id,link.supplier_id,hash(token)])).rowCount)denied('Anbindung nicht aktiv');
}

function denied(message){throw Object.assign(Error(message),{status:403});}
