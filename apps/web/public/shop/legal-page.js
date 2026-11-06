// Published text is rendered as text only; the static draft remains on failure.
export async function loadPublishedLegal({document:d,fetchImpl}){
 try{const r=await fetchImpl('/api/v1/shop/legal',{cache:'no-store',credentials:'omit',redirect:'error'});if(!r.ok)return;const data=await r.json();if(!Array.isArray(data.sections))return;
 for(const row of data.sections){if(!row||typeof row.id!=='string'||typeof row.text!=='string'||!row.text.trim()||row.text.length>10000)continue;const section=d.getElementById(row.id);if(!section?.matches('details.market-legal-section'))continue;const summary=section.querySelector('summary');section.replaceChildren(summary);const text=d.createElement('p');text.className='legal-published-text';text.style.whiteSpace='pre-wrap';text.textContent=row.text;section.append(text);}
 }catch{}
}
if(typeof document!=='undefined')loadPublishedLegal({document,fetchImpl:fetch.bind(globalThis)});
