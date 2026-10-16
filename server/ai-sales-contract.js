// Shared validation for committed and dry-run sales imports.
export function normalizeSaleEvent(event,{now=Date.now()}={}) {
  const fail=message=>{const error=new Error(message);error.status=400;throw error};
  const code=(value,label)=>{
    if(typeof value!=='string'||!value.trim()||value.trim().length>150)fail(label+' mit 1 bis 150 Zeichen erforderlich');
    return value.trim();
  };
  if(!event||typeof event!=='object'||Array.isArray(event))fail('Verkaufsereignis erforderlich');
  const externalId=code(event.eventId,'Ereignis-ID'),type=event.type??'sale';
  if(!['sale','reversal'].includes(type))fail('Ungültiger Ereignistyp');
  let timing={};
  if(event.occurredAt!==undefined){
    const value=event.occurredAt;
    // An explicit timezone and a real calendar date avoid server-local parsing
    // and Date.parse's normalization of impossible dates such as February 30.
    const day=typeof value==='string'?value.slice(0,10):'';
    const time=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;
    const calendar=Date.parse(day+'T00:00:00Z');
    if(!Number.isFinite(time)||!Number.isFinite(calendar)||new Date(calendar).toISOString().slice(0,10)!==day||Number(day.slice(0,4))<1||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59||time>now+60000)fail('Gültiger Ereigniszeitpunkt mit Zeitzone erforderlich, nicht in der Zukunft');
    timing={occurredAt:new Date(time).toISOString()};
  }
  if(type==='reversal')return {externalId,type,normalized:code(event.reversesEventId,'Originalereignis-ID'),...timing};
  if(!Array.isArray(event.items)||!event.items.length||event.items.length>100)fail('1 bis 100 Verkaufspositionen erforderlich');
  const normalized=event.items.map(item=>{
    if(!item||typeof item!=='object')fail('Verkaufsposition ungültig');
    const productCode=code(item.productCode,'Artikelcode'),quantity=item.quantity;
    if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||Math.abs(quantity*1000-Math.round(quantity*1000))>0.00001)fail('Positive numerische Menge mit höchstens drei Nachkommastellen erforderlich');
    return {productCode,quantity};
  }).sort((a,b)=>a.productCode.localeCompare(b.productCode));
  return {externalId,type,normalized,...timing};
}
