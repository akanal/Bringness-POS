import {uuid} from './ai-policy.js';
import {lockAiRestaurant} from './ai-write-authorization.js';

const topics = new Set(['address', 'hours', 'menu', 'other']);
const fail = (message, status) => {throw Object.assign(Error(message), {status})};
const clean = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';

export async function migrateAiSetupReview(db) {
 await db.query(`CREATE TABLE IF NOT EXISTS ai_setup_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ai_accounts(id),
  location_id uuid NOT NULL REFERENCES ai_locations(id),
  topic text NOT NULL CHECK(topic IN ('address','hours','menu','other')),
  question text NOT NULL,
  answer text,
  answered_at timestamptz,
  answered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE UNIQUE INDEX IF NOT EXISTS ai_setup_review_open_topic ON ai_setup_reviews(account_id,location_id,topic) WHERE answered_at IS NULL;
 CREATE INDEX IF NOT EXISTS ai_setup_review_account ON ai_setup_reviews(account_id,created_at DESC);`);
}

export async function aiSetupReviews(db, user, method, body, admin = false) {
 if(!admin && user.role !== 'restaurant') fail('Nur Restaurantkonten haben Zugriff.', 403);
 if(method === 'GET') {
  const reviews = await db.query(`SELECT r.id,r.location_id,r.topic,r.question,r.answer,r.answered_at,r.created_at,l.name AS location_name
   ${admin ? ',a.business_name' : ''}
   FROM ai_setup_reviews r JOIN ai_locations l ON l.id=r.location_id AND l.account_id=r.account_id
   ${admin ? 'JOIN ai_accounts a ON a.id=r.account_id' : 'WHERE r.account_id=$1'}
   ORDER BY (r.answered_at IS NULL) DESC,r.created_at DESC,r.id LIMIT 100`, admin ? [] : [user.id]);
  return {reviews:reviews.rows};
 }
 if(method !== 'POST') fail('Methode nicht erlaubt.', 405);
 if(admin) {
  const answer = clean(body.answer, 1500);
  if(!uuid.test(body.id || '') || !answer) fail('Prüffall und Antwort eingeben.', 400);
  const result = await db.query('UPDATE ai_setup_reviews SET answer=$2,answered_at=now(),answered_by=$3 WHERE id=$1 AND answered_at IS NULL RETURNING id',[body.id,answer,user.id]);
  if(!result.rowCount) fail('Der Prüffall wurde bereits beantwortet oder ist nicht verfügbar.', 409);
  return {ok:true};
 }
 const question = clean(body.question, 1500);
 if(!uuid.test(body.locationId || '') || !topics.has(body.topic) || !question) fail('Standort, Thema und Frage eingeben.', 400);
 const tx = await db.connect();
 try {
  await tx.query('BEGIN');
  await lockAiRestaurant(tx,user.id);
  if(!(await tx.query('SELECT id FROM ai_locations WHERE id=$1 AND account_id=$2',[body.locationId,user.id])).rowCount) fail('Standort nicht gefunden.', 404);
  const result = await tx.query('INSERT INTO ai_setup_reviews(account_id,location_id,topic,question) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[user.id,body.locationId,body.topic,question]);
  if(!result.rowCount) fail('Zu diesem Thema gibt es bereits eine offene Rückfrage für den Standort.', 409);
  await tx.query('COMMIT');
  return {ok:true,id:result.rows[0].id};
 } catch(error) {
  await tx.query('ROLLBACK');
  throw error;
 } finally {
  tx.release();
 }
}
