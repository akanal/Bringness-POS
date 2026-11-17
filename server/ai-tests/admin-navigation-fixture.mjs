// Synthetic read-only fixture shared by DOM and native-browser regression tests.
import {readFileSync} from 'node:fs';
export const adminRoot=new URL('../../apps/web/public/',import.meta.url);
export const adminExtensions=['admin/support-center.js','admin/remote-support.js','admin/platform-hub.js','admin/control-center.js'];
export const fixtureCompany='11111111-1111-4111-8111-111111111111';
export const fixtureVenue='22222222-2222-4222-8222-222222222222';
export function adminHtml(){return readFileSync(new URL('admin/index.html',adminRoot),'utf8').replace('</body>',adminExtensions.map(path=>'<script src="/'+path+'"></script>').join('')+'</body>');}
export function adminApi(path,{platform=true}={}){
 const url=new URL(path,'https://admin-navigation.test'),p=url.pathname;
 if((p.startsWith('/api/v1/platform/')||p.startsWith('/api/v1/remote-support/'))&&!platform)return {status:403,data:{error:'Nur Plattformadministratoren'}};
 const venue={id:fixtureVenue,name:'Testbetrieb',company_name:'Beispielkunde',mode:'restaurant'};
 const data={
  '/api/v1/admin/password/first-login':{required:false},'/api/v1/admin/me':{role:'owner'},
  '/api/v1/admin/overview':{restaurants:1,orders:12,employees:3,invoices:0},
  '/api/v1/admin/devices':{devices:[]},'/api/v1/admin/system':{database:'ok',devices:{total:0,online:0,active:0},serverTime:'2026-11-17T12:00:00Z'},
  '/api/v1/admin/billing':{transactions:[]},'/api/v1/admin/audit':{events:[]},
  '/api/v1/bootstrap':{restaurants:[venue]},'/api/v1/admin/team':{employees:[]},'/api/v1/admin/team/admins':{admins:[],canManage:false},
  '/api/v1/platform/overview':{plans:[{code:'fixture',name:'Testmodul',amount_cents:999}],companies:[{id:fixtureCompany,name:'Beispielkunde',restaurant_count:1,features:[],payments:[]}]},
  '/api/v1/platform/control/registers':{restaurants:[venue],devices:[]},'/api/v1/platform/control/companies':{companies:[]},
  '/api/v1/platform/control/accounts':{accounts:[]},'/api/v1/platform/control/audit':{events:[]},
  '/api/v1/platform/control/search':{companies:[{id:fixtureCompany,name:'Beispielkunde'}],restaurants:[],owners:[],employees:[]},
  '/api/v1/platform/control/offline':{counts:[],sales:[]},
  '/api/v1/platform/control/diagnostics/summary':{openCount:2},'/api/v1/platform/control/diagnostics':{openCount:2,reports:[]},
  '/api/v1/remote-support/devices':{devices:[]},'/api/v1/admin/support':{counts:[],conversations:[],frequent:[],topics:[]},
  '/api/v1/fiscal/status':{salesSigningActive:false,certified:false,dsfinvkExportAvailable:false,totalReceipts:0,unsignedReceipts:0}
 }[p];
 return data?{status:200,data}:{status:404,data:{error:'Fixture route not provided'}};
}
