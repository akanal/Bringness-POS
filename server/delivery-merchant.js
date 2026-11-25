import {withMerchantToken} from './center-mollie-merchant.js';

export function migrateDeliveryMerchant(db) {
  return db.query(`CREATE TABLE IF NOT EXISTS pos_delivery_merchants (
    restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
    organization_id text NOT NULL,
    profile_id text NOT NULL,
    verified_at timestamptz NOT NULL DEFAULT now()
  )`);
}

export function createDeliveryMerchant(db,{access,withToken=withMerchantToken,fetcher=fetch}={}) {
  return async function merchant(req,send,rid,hash) {
    if (!['GET','PUT','DELETE'].includes(req.method)) return send(405,{error:'Methode nicht erlaubt.'});
    const {rows} = await db.query(`SELECT c.organization_id,c.profile_id,
      coalesce(m.verified_at>now()-interval '24 hours' AND c.organization_id=m.organization_id
        AND c.profile_id=m.profile_id AND c.verified_at IS NOT NULL AND c.expires_at>now(),false) AS ready,
      m.restaurant_id IS NOT NULL AS linked,
      coalesce(c.verified_at IS NOT NULL AND c.expires_at>now(),false) AS "connectionReady"
      FROM (${access}) a
      LEFT JOIN center_mollie_credentials c ON c.restaurant_id=a.id
      LEFT JOIN pos_delivery_merchants m ON m.restaurant_id=a.id`,[rid,hash]);
    if (!rows.length) return send(403,{error:'Kein Zugriff auf diesen Standort.'});
    const current = rows[0];
    const configured = /^org_[a-zA-Z0-9]+$/.test(current.organization_id ?? '') &&
      /^pfl_[a-zA-Z0-9]+$/.test(current.profile_id ?? '');
    if (req.method==='GET') return send(200,{...current,configured});
    if (req.method==='DELETE') {
      await db.query(`DELETE FROM pos_delivery_merchants WHERE restaurant_id IN (SELECT id FROM (${access}) a)`,[rid,hash]);
      return send(200,{linked:false,ready:false,configured});
    }
    if (!configured) return send(409,{error:'Für diesen Standort ist noch kein Mollie-Profil hinterlegt.'});

    try {
      const failure = await withToken(db,rid,async (token,envelope) => {
        async function get(path) {
          const response = await fetcher('https://api.mollie.com/v2'+path,{
            headers:{authorization:'Bearer '+token,accept:'application/json'},
            redirect:'error',signal:AbortSignal.timeout(10000)
          });
          if (!response.ok) throw Error('MOLLIE_VERIFICATION_FAILED');
          return response.json();
        }
        const [organization,onboarding,profile] = await Promise.all([
          get('/organizations/me'),get('/onboarding/me'),get('/profiles/'+current.profile_id)
        ]);
        if (organization.id!==current.organization_id || profile.id!==current.profile_id) {
          return 'Das verbundene Mollie-Konto passt nicht zum hinterlegten Standortprofil.';
        }
        if (profile.status!=='verified') return 'Mollie hat dieses Website-Profil noch nicht verifiziert.';
        if (onboarding.canReceivePayments!==true || onboarding.canReceiveSettlements!==true) {
          return 'Mollie hat Zahlungen und Auszahlungen für dieses Konto noch nicht vollständig freigegeben.';
        }
        const result = await db.query(`INSERT INTO pos_delivery_merchants (restaurant_id,organization_id,profile_id)
          SELECT a.id,$4,$5 FROM (${access}) a JOIN center_mollie_credentials c ON c.restaurant_id=a.id
          WHERE c.token_envelope=$3 AND c.organization_id=$4 AND c.profile_id=$5
            AND c.verified_at IS NOT NULL AND c.expires_at>now()
          ON CONFLICT (restaurant_id) DO UPDATE SET organization_id=EXCLUDED.organization_id,
            profile_id=EXCLUDED.profile_id,verified_at=now() RETURNING restaurant_id`,[rid,hash,envelope,current.organization_id,current.profile_id]);
        return result.rows.length ? null : 'Die Mollie-Verbindung hat sich während der Prüfung geändert. Bitte erneut prüfen.';
      });
      if (failure !== null) return send(409,{error:failure || 'Mollie-Profil konnte für diesen Standort nicht bestätigt werden.'});
      return send(200,{linked:true,ready:true,configured,connectionReady:true,profile_id:current.profile_id});
    } catch {
      return send(503,{error:'Mollie-Prüfung derzeit nicht möglich. Bitte Verbindung prüfen.'});
    }
  };
}
