import crypto from 'node:crypto';
export const supplierRoles=['dealer','wholesaler','manufacturer'];
export const units=['kg','l','piece'];
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
export function passwordHash(value){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(value,salt,64).toString('hex')}
export function passwordMatches(value,stored){const [salt,key]=String(stored).split(':');if(!salt||!key)return false;const actual=crypto.scryptSync(value,salt,64);const expected=Buffer.from(key,'hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected)}
export function validPassword(value){return typeof value==='string'&&value.length>=10&&value.length<=128}
export function quantity(value){const n=Number(value);if(!Number.isFinite(n)||n<0||n>1000000||Math.abs(n*1000-Math.round(n*1000))>0.00001)throw new Error('Menge mit höchstens drei Nachkommastellen erforderlich');return n}
export function money(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>100000000)throw new Error('Ungültiger Nettopreis');return n}
export function orderAmounts(priceCents,packs,commissionBps=200){money(priceCents);if(!Number.isSafeInteger(packs)||packs<1||packs>10000)throw new Error('1 bis 10.000 ganze Packungen erforderlich');const netCents=priceCents*packs;if(!Number.isSafeInteger(netCents)||netCents>100000000)throw new Error('Bestellwert zu hoch');return {netCents,commissionCents:Math.round(netCents*commissionBps/10000)}}
export function mayActOnOrder(actor,order,action){if(action==='accept')return actor.id===order.supplier_id&&order.status==='sent';if(action==='receive')return actor.id===order.buyer_id&&order.status==='accepted';if(action==='cancel')return [order.buyer_id,order.supplier_id].includes(actor.id)&&['sent','accepted'].includes(order.status);return false}
