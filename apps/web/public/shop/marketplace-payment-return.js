import {createMarketClient} from './market-client.js';
import {mountMarketPayment} from './market-payment-ui.js';
const host=document.getElementById('market-payment-return'),u=new URL(location.href),orderId=u.searchParams.get('marketOrderId');let mounted;
const client=createMarketClient({window,onPrivacy:()=>{mounted?.dispose();host.textContent='Private Zahlungsansicht geschlossen. Bitte erneut über deine Bestellungen öffnen.';}});
if(window.top!==window.self||u.hash||[...u.searchParams.keys()].some(k=>k!=='marketOrderId')||u.searchParams.getAll('marketOrderId').length!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(orderId||''))host.textContent='Ungültiger Bestellverweis. Bitte über deine Bestellungen öffnen.';
else mounted=mountMarketPayment({window,host,client,orderId,autoLoad:true});
