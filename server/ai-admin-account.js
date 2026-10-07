const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function adminAccountDetail(db,id){
 if(!uuid.test(id||''))throw Object.assign(Error('Ungültiges AI-Konto'),{status:400});
 const account=(await db.query('SELECT id,email,name,business_name,role,status,city,created_at FROM ai_accounts WHERE id=$1',[id])).rows[0];
 if(!account)throw Object.assign(Error('AI-Konto nicht gefunden'),{status:404});
 const [locations,stock,forecasts,events,procurement,runs,connectors]=await Promise.all([
  db.query(`SELECT l.id,l.name,l.address,p.weather_station,p.demand_rules,p.hours,p.closed_dates FROM ai_locations l LEFT JOIN ai_plan_settings p ON p.location_id=l.id WHERE l.account_id=$1 ORDER BY l.name LIMIT 100`,[id]),
  db.query(`SELECT s.id,s.name,s.unit,s.quantity,s.minimum,l.name location_name FROM ai_stock s JOIN ai_locations l ON l.id=s.location_id WHERE s.account_id=$1 ORDER BY l.name,s.name LIMIT 200`,[id]),
  db.query(`SELECT f.day,f.hour,f.captured_at,f.result,l.name location_name FROM ai_forecast_snapshots f JOIN ai_locations l ON l.id=f.location_id WHERE f.account_id=$1 ORDER BY f.captured_at DESC LIMIT 30`,[id]),
  db.query(`SELECT e.id,e.title,e.place,e.starts_at,e.ends_at,e.status,l.name location_name FROM ai_local_events e JOIN ai_locations l ON l.id=e.location_id WHERE e.account_id=$1 ORDER BY e.starts_at DESC LIMIT 100`,[id]),
  db.query('SELECT policy,version,updated_at FROM ai_auto_procurement WHERE account_id=$1',[id]),
  db.query('SELECT id,day,state,net_cents,error,updated_at FROM ai_auto_procurement_runs WHERE account_id=$1 ORDER BY day DESC LIMIT 30',[id]),
  db.query('SELECT id,name,kind,location_id,active,last_sync,last_error,pos_restaurant_id FROM ai_connectors WHERE account_id=$1 ORDER BY id LIMIT 100',[id])
 ]);
 return {account,locations:locations.rows,stock:stock.rows,forecasts:forecasts.rows,events:events.rows,procurement:procurement.rows[0]||null,runs:runs.rows,connectors:connectors.rows,limits:{locations:100,stock:200,forecasts:30,events:100,runs:30,connectors:100}};
}
export async function adminDisableProcurement(db,actor,id){
 if(!uuid.test(id||''))throw Object.assign(Error('Ungültiges AI-Konto'),{status:400});
 const c=await db.connect();try{
  await c.query('BEGIN');
  const account=(await c.query('SELECT id FROM ai_accounts WHERE id=$1',[id])).rows[0];
  if(!account){await c.query('ROLLBACK');throw Object.assign(Error('AI-Konto nicht gefunden'),{status:404})}
  const previous=(await c.query('SELECT policy,version FROM ai_auto_procurement WHERE account_id=$1 FOR UPDATE',[id])).rows[0];
  if(previous?.policy.enabled){
   await c.query("UPDATE ai_auto_procurement SET policy=jsonb_set(policy,'{enabled}','false'),version=version+1,updated_at=now() WHERE account_id=$1",[id]);
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,'platform_procurement_disabled',$3::jsonb)",[actor.id,id,JSON.stringify({before:{enabled:true,version:previous.version},after:{enabled:false,version:previous.version+1}})]);
  }
  await c.query('COMMIT');return {ok:true,changed:!!previous?.policy.enabled,message:'Automatische Beschaffung ist ausgeschaltet. Bereits abgeschlossene Bestellungen bleiben bestehen.'};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
