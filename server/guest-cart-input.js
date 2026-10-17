const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=()=>{throw Object.assign(Error('Ungültiger Artikel, Menge oder Beilage'),{status:400});};
export function legacyGuestItems(items){
 if(!Array.isArray(items)||!items.length||items.length>20)fail();const seen=new Set();
 return items.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.productId!=='string'||!uuid.test(item.productId)||typeof item.qty!=='number'||!Number.isInteger(item.qty)||item.qty<1||item.qty>99)fail();
  const productId=item.productId.toLowerCase();if(seen.has(productId))fail();seen.add(productId);
  if(item.note!==undefined&&(typeof item.note!=='string'||item.note.length>300))fail();
  const extras=item.extraIds??[];if(!Array.isArray(extras)||extras.length>50||extras.some(x=>typeof x!=='string'||!uuid.test(x)))fail();
  const extraIds=extras.map(x=>x.toLowerCase());if(new Set(extraIds).size!==extraIds.length)fail();
  return {productId,qty:item.qty,note:(item.note||'').trim(),extraIds};
 });
}
