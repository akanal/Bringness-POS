export const languageDatabaseName='bringness_languages';
export function languageConnection(env) {
  if(!env.DATABASE_URL)throw Error('Language database configuration missing');
  const url=new URL(env.LANGUAGE_DATABASE_URL||env.DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Invalid language database connection');
  if(env.LANGUAGE_DATABASE_URL&&decodeURIComponent(url.pathname.slice(1))!==languageDatabaseName)throw Error('Language database must use its dedicated name');
  url.pathname='/'+languageDatabaseName;
  return url.toString();
}
export function catalogFor(catalog,system) {
  if(!['ai','pos'].includes(system))throw Error('Unknown language namespace');
  const dictionary=Object.create(null);
  for(const namespace of ['common',system])for(const entry of catalog.entries)if(entry.namespace===namespace)dictionary[entry.source]=entry.translations;
  return {version:catalog.version,languages:catalog.languages,dictionary};
}
export async function seedLanguages(pool,catalog) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('bringness_language_catalog_seed'))");
    await c.query(`CREATE TABLE IF NOT EXISTS ui_languages(code text PRIMARY KEY,label text NOT NULL,managed_version bigint NOT NULL);
      CREATE TABLE IF NOT EXISTS ui_translations(namespace text NOT NULL CHECK(namespace IN ('common','ai','pos')),source text NOT NULL,translations jsonb NOT NULL,managed_version bigint NOT NULL,PRIMARY KEY(namespace,source));`);
    for(const [code,label]of Object.entries(catalog.languages))await c.query('INSERT INTO ui_languages VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET label=EXCLUDED.label,managed_version=EXCLUDED.managed_version WHERE ui_languages.managed_version<EXCLUDED.managed_version',[code,label,catalog.version]);
    for(const entry of catalog.entries)await c.query('INSERT INTO ui_translations VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(namespace,source) DO UPDATE SET translations=EXCLUDED.translations,managed_version=EXCLUDED.managed_version WHERE ui_translations.managed_version<EXCLUDED.managed_version',[entry.namespace,entry.source,JSON.stringify(entry.translations),catalog.version]);
    await c.query('COMMIT');
  } catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}
export async function readLanguages(pool,system) {
  if(!['ai','pos'].includes(system))throw Error('Unknown language namespace');
  const languages=await pool.query('SELECT code,label,managed_version FROM ui_languages ORDER BY code');
  const entries=await pool.query("SELECT namespace,source,translations,managed_version FROM ui_translations WHERE namespace IN ('common',$1)",[system]);
  const version=Math.max(0,...languages.rows.map(r=>Number(r.managed_version)),...entries.rows.map(r=>Number(r.managed_version)));
  return catalogFor({version,languages:Object.fromEntries(languages.rows.map(r=>[r.code,r.label])),entries:entries.rows},system);
}
