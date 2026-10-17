// Owner-approved new-contract catalogue, 17 October 2026. Existing contracts retain their amounts.
export const moduleCatalog=Object.freeze({
 table_management_monthly:{feature:'table_management',name:'Tischsystem',netCents:999,requires:['pos_base']},
 table_qr_monthly:{feature:'table_qr',name:'Tisch-QR-Bestellsystem',netCents:2999,requires:['pos_base','table_management']},
 counter_qr_monthly:{feature:'counter_qr',name:'Tresen-System',netCents:2999,requires:['pos_base','table_management']},
 center_monthly:{feature:'center',name:'Center-System',netCents:2999,requires:['pos_base','table_management']},
 personnel_monthly:{feature:'personnel',name:'Personalmanagement',netCents:999,requires:['pos_base']},
 ean_scanner_monthly:{feature:'ean_scanner',name:'EAN-Scanner',netCents:999,requires:['pos_base']},
 display_control_monthly:{feature:'display_control',name:'Displaysteuerung',netCents:1499,requires:['pos_base']},
 kitchen_monthly:{feature:'kitchen',name:'Küche',netCents:999,requires:['pos_base']}
});
export const planFeature=code=>moduleCatalog[code]?.feature||({pos_base_monthly:'pos_base',restaurant_monthly:'restaurant'})[code]||null;
export function moduleBookingError(code,features){
 if(code==='restaurant_monthly')return 'Der Restauranttarif wird für neue Buchungen nicht mehr angeboten.';
 const plan=moduleCatalog[code];if(!plan)return null;
 if(plan.requires.some(feature=>!features[feature]))return code.includes('qr')||code==='center_monthly'?'Zuerst Kassenlizenz und Tischsystem aktivieren.':'Zuerst eine Kassenlizenz aktivieren.';
 if(code==='center_monthly'&&(features.table_qr||features.counter_qr)||['table_qr_monthly','counter_qr_monthly'].includes(code)&&features.center)return 'Center und die anderen QR-Systeme werden getrennt gebucht.';
 return null;
}
export async function migrateModuleCatalog(pool){
 // Never update entitlements, transactions, provider subscriptions or customer-specific terms.
 for(const [code,p] of Object.entries(moduleCatalog))await pool.query(`INSERT INTO billing_plans(code,name,billing_type,amount_cents,currency,active) VALUES($1,$2,'monthly',$3,'EUR',true) ON CONFLICT(code) DO UPDATE SET name=excluded.name,amount_cents=excluded.amount_cents,active=true`,[code,p.name,p.netCents]);
 await pool.query("UPDATE billing_plans SET active=false WHERE code='restaurant_monthly'");
}
// Called inside order transactions as well as by public menu/QR routes.
export async function orderingModuleAccess(pool,companyId,mode){
 const feature=mode==='pickup'?'counter_qr':mode==='center'?'center':'table_qr';
 const q=await pool.query(`SELECT feature_code FROM company_features WHERE company_id=$1 AND status='active' AND ((ends_at IS NULL OR ends_at>now()) OR grace_until>now())`,[companyId]);
 const features=new Set(q.rows.map(r=>r.feature_code));
 const legacyRestaurant=features.has('restaurant');
 const download=features.has('pos_base')||legacyRestaurant||Boolean((await pool.query("SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code='download_license' AND ce.status='active'",[companyId])).rowCount);
 if(!download)return false;
 const legacy=features.has('table_qr')&&Boolean((await pool.query("SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code='table_qr_monthly' AND ce.purchased_at<'2026-10-17T08:19:00Z'",[companyId])).rowCount);
 return Boolean((features.has('table_management')||legacyRestaurant||legacy)&&(features.has(feature)||mode!=='center'&&legacy||mode==='center'&&legacyRestaurant));
}
