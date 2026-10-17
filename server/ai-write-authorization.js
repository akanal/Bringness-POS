// Hold the account lock until the surrounding stock transaction commits.
export async function lockAiRestaurant(db,accountId){
 const result=await db.query("SELECT id FROM ai_accounts WHERE id=$1 AND status='active' AND role='restaurant' FOR UPDATE",[accountId]);
 if(!result.rows.length)throw Object.assign(Error('Restaurantkonto nicht mehr für Lagerbuchungen freigegeben'),{status:403});
 return result.rows[0];
}
