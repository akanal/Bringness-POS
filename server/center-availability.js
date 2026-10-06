// Evaluate the existing POS availability rules at request time in Berlin.
export function centerProductAvailable(product, now = new Date()) {
 if (product.ai_stock_available === false) return false;
 let rule;
 try { rule = typeof product.availability_rule === 'string' ? JSON.parse(product.availability_rule) : product.availability_rule; }
 catch { return false; }
 if (!rule?.enabled) return true;
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone:'Europe/Berlin',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const time = `${parts.hour}:${parts.minute}`, day = `${parts.month}-${parts.day}`;
 const inRange = (value,start,end) => start && end ? (start<=end ? value>=start && value<=end : value>=start || value<=end) : start ? value>=start : end ? value<=end : true;
 return inRange(time,rule.startTime,rule.endTime) && inRange(day,String(rule.startDate||'').slice(5),String(rule.endDate||'').slice(5));
}
export function visibleCenterProducts(products, now = new Date()) {
 return products.filter(p=>centerProductAvailable(p,now)).map(({availability_rule,ai_stock_available,...product})=>product);
}
