// Explicit metadata stub for transport-only tests; real schema tests use PGlite.
export async function registrationMetadataQuery(sql){
 if(!sql.includes('information_schema.columns'))return {rows:[]};
 const definitions={companies:{id:'uuid',name:'text'},users:{id:'uuid',company_id:'uuid',email:'text',password_hash:'text',display_name:'text',role:'text',status:'text'},company_billing_profiles:{company_id:'uuid',company_name:'text',contact_name:'text',street:'text',postal_code:'text',city:'text',country:'text'}};
 return {rows:Object.entries(definitions).flatMap(([table_name,columns])=>Object.entries(columns).map(([column_name,data_type])=>({table_name,column_name,data_type,character_maximum_length:null,is_nullable:'YES',column_default:null,is_identity:'NO',is_generated:'NEVER'})))};
}
