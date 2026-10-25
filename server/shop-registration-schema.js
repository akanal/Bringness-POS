// Structural preflight only. Never reads account rows or changes shared schema.
const text=max=>Object.freeze({type:'text',max});
export const registrationSchema=Object.freeze({
 companies:Object.freeze({id:Object.freeze({type:'uuid'}),name:text(500)}),
 users:Object.freeze({id:Object.freeze({type:'uuid'}),company_id:Object.freeze({type:'uuid'}),email:text(254),password_hash:text(128),display_name:text(100),role:text(5),status:text(6)}),
 company_billing_profiles:Object.freeze({company_id:Object.freeze({type:'uuid'}),company_name:text(500),contact_name:text(100),street:text(500),postal_code:text(500),city:text(500),country:text(500)})
});
const unavailable=()=>Object.assign(Error('REGISTRATION_SCHEMA_UNAVAILABLE'),{code:'REGISTRATION_SCHEMA_UNAVAILABLE'});
export async function inspectShopRegistrationSchema(db,{enabled=false}={}){
 if(enabled!==true)return {enabled:false,compatible:false,issues:[]};
 let rows;try{const result=await db.query(`SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_default,is_identity,is_generated,identity_generation
 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])
 ORDER BY table_name,ordinal_position`,[Object.keys(registrationSchema)]);rows=result.rows;if(!Array.isArray(rows)||!rows.every(row=>row&&typeof row.table_name==='string'&&typeof row.column_name==='string'&&typeof row.data_type==='string'&&['YES','NO'].includes(row.is_nullable)&&['YES','NO'].includes(row.is_identity)&&['ALWAYS','NEVER'].includes(row.is_generated)&&(row.column_default===null||typeof row.column_default==='string')&&(row.character_maximum_length===null||Number.isSafeInteger(row.character_maximum_length))))throw Error();}catch{throw unavailable();}
 const issues=[];
 for(const [table,fields] of Object.entries(registrationSchema)){
  const columns=rows.filter(row=>row.table_name===table);
  for(const [column,rule] of Object.entries(fields)){
   const found=columns.filter(row=>row.column_name===column);
   if(found.length!==1){issues.push({table,column,code:'MISSING_COLUMN'});continue;}
   const row=found[0];
   if(row.is_generated==='ALWAYS'||(row.is_identity==='YES'&&row.identity_generation==='ALWAYS'))issues.push({table,column,code:'NON_WRITABLE_COLUMN'});
   const textType=['text','character varying'].includes(row.data_type);
   if(rule.type==='uuid'?row.data_type!=='uuid':!textType){issues.push({table,column,code:'UNSUPPORTED_TYPE'});continue;}
   if(rule.type==='text'&&row.data_type==='character varying'&&row.character_maximum_length!==null&&(!Number.isSafeInteger(row.character_maximum_length)||row.character_maximum_length<rule.max))issues.push({table,column,code:'TEXT_CAPACITY'});
  }
  for(const row of columns)if(!Object.hasOwn(fields,row.column_name)&&row.is_nullable==='NO'&&row.column_default===null&&row.is_identity!=='YES'&&(!row.is_generated||row.is_generated==='NEVER'))issues.push({table,column:row.column_name,code:'REQUIRED_EXTRA_COLUMN'});
 }
 return {enabled:true,compatible:issues.length===0,issues};
}
export async function assertShopRegistrationSchema(db){
 const result=await inspectShopRegistrationSchema(db,{enabled:true});
 if(!result.compatible)throw Object.assign(Error('REGISTRATION_SCHEMA_NOT_READY'),{code:'REGISTRATION_SCHEMA_NOT_READY'});
}
