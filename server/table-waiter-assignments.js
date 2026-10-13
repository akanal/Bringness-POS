const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export async function tableWaiterAssignments(pool,companyId,area,method,b) {
  if(!uuid(String(b.restaurantId||'')))fail('Restaurant ungültig');
  if(method==='GET') {
    const {rows}=await pool.query("SELECT t.id,t.name,t.area,t.waiter_employee_id,array_remove(ARRAY[t.waiter_employee_id]||t.waiter_employee_ids,NULL) waiter_ids FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.restaurant_id=$1 AND r.company_id=$2 ORDER BY t.sort_order,t.name",[b.restaurantId,companyId]);
    if(!area)return {tables:rows};
    const groups=new Map();
    for(const t of rows){let group=groups.get(t.area);if(!group){group={area:t.area,table_count:0,assigned_count:0,waiter_ids:[],common_waiter_ids:[...t.waiter_ids]};groups.set(t.area,group)}group.table_count++;if(t.waiter_ids.length)group.assigned_count++;group.waiter_ids=[...new Set([...group.waiter_ids,...t.waiter_ids])];group.common_waiter_ids=group.common_waiter_ids.filter(id=>t.waiter_ids.includes(id))}
    return {areas:[...groups.values()].sort((a,b)=>a.area.localeCompare(b.area))};
  }
  const supplied=b.waiterIds===undefined?(b.waiterId?[b.waiterId]:b.waiterId===null?[]:null):b.waiterIds;
  if(!Array.isArray(supplied)||supplied.length>100||supplied.some(id=>typeof id!=='string'||!uuid(id)))fail('Kellnerauswahl ungültig');
  const ids=[...new Set(supplied)];
  if(area?(typeof b.area!=='string'||!b.area.trim()||b.area.length>120):!uuid(String(b.tableId||'')))fail('Tisch oder Bereich ungültig');
  const c=await pool.connect();try {
    await c.query('BEGIN');
    if(!(await c.query("SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 AND mode='restaurant' FOR UPDATE",[b.restaurantId,companyId])).rowCount)fail('Restaurant nicht gefunden',404);
    const tables=await c.query('SELECT id FROM dining_tables WHERE restaurant_id=$1 AND '+(area?'area=$2':'id=$2')+' ORDER BY id FOR UPDATE',[b.restaurantId,area?b.area:b.tableId]);
    if(!tables.rowCount)fail('Tisch oder Bereich nicht gefunden',404);
    if(ids.length&&(await c.query("SELECT id FROM employees WHERE id=ANY($1::uuid[]) AND restaurant_id=$2 AND role='waiter' AND active=true ORDER BY id FOR SHARE",[ids,b.restaurantId])).rowCount!==ids.length)fail('Aktiver Kellner nicht gefunden',404);
    await c.query('UPDATE dining_tables SET waiter_employee_id=$1,waiter_employee_ids=$2::uuid[] WHERE id=ANY($3::uuid[])',[ids[0]||null,ids.slice(1),tables.rows.map(t=>t.id)]);
    await c.query('COMMIT');
    return area?{updatedTables:tables.rowCount,area:b.area,waiterIds:ids}:{table:{id:b.tableId,waiter_employee_id:ids[0]||null,waiter_ids:ids}};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
