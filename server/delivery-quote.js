import {parseDeliveryCart,priceDeliveryCart} from './delivery-cart.js';
import {readJsonObject} from './http-body.js';

export function createDeliveryQuote(db,{idPattern,postcodePattern}) {
  return async function deliveryQuote(req,send) {
    if (req.method !== 'POST') return send(405,{error:'Methode nicht erlaubt.'});
    let input;
    try {
      input = await readJsonObject(req,{maxBytes:8192});
    } catch (error) {
      if (!error.status) throw error;
      return send(error.status,{error:error.message});
    }
    const cart = parseDeliveryCart(input,idPattern,postcodePattern);
    if (cart.error) return send(400,cart);

    const client = await db.connect();
    let status;
    let result;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const {rows} = await client.query(`SELECT 1 FROM pos_delivery_merchants m
        JOIN center_mollie_credentials c ON c.restaurant_id=m.restaurant_id
          AND c.organization_id=m.organization_id AND c.profile_id=m.profile_id
        WHERE m.restaurant_id=$1 AND m.verified_at>now()-interval '24 hours'
          AND c.verified_at IS NOT NULL AND c.expires_at>now()`,[cart.restaurantId]);
      if (!rows.length) {
        status = 409;
        result = {error:'Onlinezahlung ist an diesem Standort derzeit nicht verfügbar.'};
      } else {
        const {error,subtotal,fee,totalCents} = await priceDeliveryCart(client,cart);
        status = error ? 409 : 200;
        result = error ? {error} : {currency:'EUR',subtotalCents:subtotal,feeCents:fee,totalCents};
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code !== '40001') throw error;
      status = 409;
      result = {error:'Das Bestellangebot hat sich geändert. Bitte prüfe den Warenkorb erneut.'};
    } finally {
      client.release();
    }
    return send(status,result);
  };
}
