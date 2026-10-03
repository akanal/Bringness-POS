// Shared validation for committed and dry-run sales imports.
export function normalizeSaleEvent(event) {
  const fail=message=>{const error=new Error(message);error.status=400;throw error};
  const code=(value,label)=>{
    if(typeof value!=='string'||!value.trim()||value.trim().length>150)fail(label+' mit 1 bis 150 Zeichen erforderlich');
    return value.trim();
  };
  if(!event||typeof event!=='object'||Array.isArray(event))fail('Verkaufsereignis erforderlich');
  const externalId=code(event.eventId,'Ereignis-ID'),type=event.type??'sale';
  if(!['sale','reversal'].includes(type))fail('Ungültiger Ereignistyp');
  if(type==='reversal')return {externalId,type,normalized:code(event.reversesEventId,'Originalereignis-ID')};
  if(!Array.isArray(event.items)||!event.items.length||event.items.length>100)fail('1 bis 100 Verkaufspositionen erforderlich');
  const normalized=event.items.map(item=>{
    if(!item||typeof item!=='object')fail('Verkaufsposition ungültig');
    const productCode=code(item.productCode,'Artikelcode'),quantity=item.quantity;
    if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||Math.abs(quantity*1000-Math.round(quantity*1000))>0.00001)fail('Positive numerische Menge mit höchstens drei Nachkommastellen erforderlich');
    return {productCode,quantity};
  }).sort((a,b)=>a.productCode.localeCompare(b.productCode));
  return {externalId,type,normalized};
}
