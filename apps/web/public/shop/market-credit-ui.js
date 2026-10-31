import {marketMoney} from './market-policy.js';
import {marketError} from './market-client.js';
const policy='merchant-credit-termination-v1';
const labels={refund:'Provisionsgutschrift',offset:'Mit Provision verrechnet',release:'Verrechnung zurückgebucht',payout:'Auszahlung bestätigt'};
export function mountMarketCredit({window:w,host,client}){
 const d=host.ownerDocument,el=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const load=el('button','Guthaben und Buchungen laden'),status=el('p','Guthaben noch nicht geladen.'),view=el('div');load.type='button';status.setAttribute('role','status');host.append(load,status,view);
 let epoch=0,busy=false,renderedToken=null;const token=()=>w.localStorage.getItem('bringness-pos-token');
 function privacy(){epoch++;renderedToken=null;view.replaceChildren();status.textContent='Private Guthabenansicht geschlossen. Bitte erneut laden.';}
 w.addEventListener('pagehide',privacy);w.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token')privacy();});d.addEventListener('visibilitychange',()=>{if(d.hidden)privacy();});
 function valid(r){return r?.currency==='EUR'&&r.policy===policy&&typeof r.accountExists==='boolean'&&Number.isSafeInteger(r.balanceNetCents)&&r.balanceNetCents>=0&&typeof r.payoutEligible==='boolean'&&r.automaticSettlementEnabled===false&&r.canPay===false&&r.limit===50&&typeof r.hasMore==='boolean'&&Array.isArray(r.entries)&&r.entries.length<=50&&r.entries.every(e=>Object.hasOwn(labels,e.kind)&&Number.isSafeInteger(e.amountNetCents)&&(['refund','release'].includes(e.kind)?e.amountNetCents>=0:e.amountNetCents<=0)&&typeof e.createdAt==='string'&&Number.isFinite(Date.parse(e.createdAt)));}
 w.addEventListener('focus',()=>{if(renderedToken!==null&&renderedToken!==token())privacy();});w.addEventListener('offline',privacy);
 async function refresh(){if(busy||d.hidden)return;busy=true;load.disabled=true;const start=++epoch,original=token();view.replaceChildren();
  try{const r=await client.call('/merchant-credit',{auth:true});if(start!==epoch||original!==token()||d.hidden)return;if(!valid(r))throw Object.assign(Error(),{code:'INVALID_RESPONSE'});
   view.append(el('p',r.accountExists?'Provisionsguthaben netto: '+marketMoney(r.balanceNetCents):'Noch kein Provisionsguthabenkonto vorhanden.'),el('p',r.payoutEligible?'Vertragsbeendigung erfasst. Restguthaben ist zur Auszahlung berechtigt; dies bestätigt noch keine Überweisung.':'Verrechnung mit künftigen Bringness-Provisionen. Auszahlung erst nach wirksamer Vertragsbeendigung durch Kündigung.'),el('p','Die automatische Zahlungs- und Gutschriftenverarbeitung ist noch nicht aktiviert. Käufererstattungen erfolgen unabhängig.'));
   const list=el('ul');for(const e of r.entries)list.append(el('li',labels[e.kind]+': '+marketMoney(e.amountNetCents)+' netto · '+new Date(e.createdAt).toLocaleString('de-DE')));if(r.entries.length)view.append(list);else view.append(el('p','Keine Guthabenbuchungen vorhanden.'));if(r.hasMore)view.append(el('p','Angezeigt werden die letzten 50 Buchungen. Der Kontostand umfasst alle Buchungen.'));renderedToken=original;status.textContent='Gespeicherten Guthabenstand geladen.';
  }catch(e){if(start===epoch&&original===token()){view.replaceChildren();status.textContent=marketError(e);}}
  finally{busy=false;load.disabled=false;}
 }
 load.addEventListener('click',refresh);return {refresh,privacy};
}
