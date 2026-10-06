(() => {
 const input=document.getElementById('volume'),output=document.getElementById('cost'),euro=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
 let prices={restaurant_premium:2990,supplier_basic:0,supplier_pro:4990};
 function render(){const volume=input.valueAsNumber;if(!Number.isFinite(volume)||volume<0||volume>100000000){output.textContent='Bitte einen gültigen Netto-Warenwert zwischen 0 und 100.000.000 € eingeben.';return}const commission=Math.round(volume*100*.02)/100;output.textContent=`Während der Einführung: beide Shops ${euro.format(commission)}. Im Monatstarif: Basis ${euro.format(prices.supplier_basic/100+commission)}, Profi ${euro.format(prices.supplier_pro/100+commission)}.`;document.querySelectorAll('[data-tariff]').forEach(node=>{if(prices[node.dataset.tariff]!==undefined)node.textContent=euro.format(prices[node.dataset.tariff]/100)})}
 input.addEventListener('input',render);render();
 fetch('/api/ai/pricing').then(response=>{if(!response.ok)throw Error('Tarife nicht erreichbar');return response.json()}).then(result=>{for(const plan of result.plans||[])if(plan.code in prices&&Number.isSafeInteger(plan.monthly_cents)&&plan.monthly_cents>=0)prices[plan.code]=plan.monthly_cents;render()}).catch(()=>{});
})();
