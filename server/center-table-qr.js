const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function exportCenterTableQr(pool,user,centerId,tableId,env=process.env,render){
 if(!uuid.test(centerId)||!uuid.test(tableId))return {status:404,error:'Tisch nicht gefunden'};
 const table=(await pool.query(`SELECT t.name,t.qr_token FROM center_tables t JOIN centers c ON c.id=t.center_id
 WHERE t.id=$1 AND c.id=$2 AND c.company_id=$3 AND t.active=true AND c.active=true`,[tableId,centerId,user.company_id])).rows[0];
 if(!table||!/^[a-f0-9]{48}$/.test(table.qr_token||''))return {status:404,error:'Tisch nicht gefunden'};
 let origin;
 try{
  origin=new URL(env.CENTER_PUBLIC_ORIGIN||env.PUBLIC_BASE_URL||env.PUBLIC_URL||'');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error();
 }catch{return {status:503,error:'Die öffentliche Center-Adresse ist noch nicht eingerichtet.'};}
 const target=new URL('/center/index.html',origin);target.searchParams.set('code',table.qr_token);
 if(!render){const {default:QRCode}=await import('qrcode');render=(value)=>QRCode.toString(value,{type:'svg',errorCorrectionLevel:'M',margin:4,width:600});}
 return {status:200,svg:await render(target.href),filename:'center-tisch-'+tableId+'.svg'};
}
