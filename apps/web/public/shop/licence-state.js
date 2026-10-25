export const licenceStates=Object.freeze({
 active:Object.freeze({label:'Als aktiv gespeichert',tone:'info'}),
 canceled:Object.freeze({label:'Als gekündigt gespeichert',tone:'neutral'}),
 expired:Object.freeze({label:'Als abgelaufen gespeichert',tone:'warning'}),
 pending:Object.freeze({label:'Freischaltung ausstehend',tone:'warning'}),
 suspended:Object.freeze({label:'Als gesperrt gespeichert',tone:'warning'}),
 test:Object.freeze({label:'TEST-Eintrag · keine produktive Lizenz',tone:'warning'}),
 unknown:Object.freeze({label:'Lizenzstatus muss geprüft werden',tone:'warning'})
});
export function validLicenceOverview(value){
 if(!value||value.version!==1||value.canPay!==false||value.canActivate!==false||value.canManage!==false||value.checkoutConnected!==false||typeof value.scope!=='string'||!/^[a-f0-9]{64}$/.test(value.scope)||typeof value.checkedAt!=='string'||!Number.isFinite(Date.parse(value.checkedAt))||!Array.isArray(value.items)||value.items.length>12)return false;
 const seen=new Set(),date=v=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v));
 return value.items.every(i=>{if(!i||typeof i.planCode!=='string'||!/^[a-z_]{1,80}$/.test(i.planCode)||seen.has(i.planCode)||typeof i.name!=='string'||i.name.length<2||i.name.length>120||/[\u0000-\u001f\u007f]/.test(i.name)||!['base','addon'].includes(i.family)||!['monthly','once'].includes(i.period)||!Object.hasOwn(licenceStates,i.status)||!date(i.periodEnd)||!date(i.purchasedAt)||i.accessGranted!==false)return false;seen.add(i.planCode);return true;});
}
