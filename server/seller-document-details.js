export function sellerDocumentDetails(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Verkäuferangaben prüfen');
 const result={};for(const [key,max]of Object.entries({taxNumber:80,bankName:120,iban:42,bic:11,phone:60,email:254})){
  if(value[key]!=null&&typeof value[key]!=='string')throw Error('Ungültige Verkäuferangaben');
  result[key]=(value[key]||'').trim();if(/[\x00-\x1f\x7f]/.test(result[key]))throw Error('Ungültige Verkäuferangaben');
  if(key==='bic')result[key]=result[key].replace(/ /g,'');if(result[key].length>max)throw Error('Ungültige Verkäuferangaben');
 }
 result.iban=result.iban.replace(/\s/g,'').toUpperCase();result.bic=result.bic.replace(/\s/g,'').toUpperCase();
 if(result.iban){
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(result.iban))throw Error('IBAN prüfen');
  let remainder=0;for(const c of result.iban.slice(4)+result.iban.slice(0,4)){for(const digit of /[A-Z]/.test(c)?String(c.charCodeAt(0)-55):c)remainder=(remainder*10+Number(digit))%97;}
  if(remainder!==1)throw Error('IBAN-Prüfziffer stimmt nicht');
 }
 if(/^\d{8}$/.test(result.bic))throw Error('Im BIC-Feld steht eine Bankleitzahl. Bitte BIC / SWIFT mit 8 oder 11 Zeichen eingeben oder das optionale Feld leer lassen');
 if(result.bic&&!/^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(result.bic))throw Error('BIC prüfen');
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw Error('E-Mail-Adresse prüfen');
 return result;
}

export async function saveSellerDocumentDetails(pool,actor,value){
 const details=sellerDocumentDetails(value),client=await pool.connect();
 try{await client.query('BEGIN');const current=await client.query("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND status='active' AND role IN ('owner','admin') AND NOT coalesce(must_change_password,false) FOR SHARE",[actor.id,actor.company_id]);
  if(!current.rowCount)throw Object.assign(Error('Verwaltungszugang nicht mehr aktiv'),{status:403});
  const result=await client.query('UPDATE company_billing_profiles SET document_details=$2::jsonb,updated_at=now() WHERE company_id=$1 RETURNING document_details',[actor.company_id,JSON.stringify(details)]);
  if(!result.rowCount)throw Object.assign(Error('Zuerst die Firmenanschrift unter Lizenz & Abo speichern'),{status:409});
  await client.query('COMMIT');return result.rows[0].document_details;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release();}
}
