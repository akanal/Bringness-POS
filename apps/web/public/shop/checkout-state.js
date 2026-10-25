export const checkoutStatuses=Object.freeze({
 prepared:{title:'Vorbereitung gespeichert',detail:'Die Vorbereitung wurde gespeichert. Eine Zahlung wurde dadurch nicht ausgelöst.'},
 uncertain:{title:'Unklarer Zahlungsstatus',detail:'Der Vorgang muss geprüft werden. Keine neue Zahlung oder erneute Übermittlung starten.'},
 open:{title:'Zahlung noch offen',detail:'Es gibt bereits einen zugeordneten Vorgang. Bitte den gespeicherten Status prüfen.'},
 paid:{title:'Zahlung erfasst · Lizenz weiterhin gesperrt',detail:'Eine erfasste Zahlung ist noch keine Lizenzfreigabe oder ausgestellte Rechnung.'},
 failed:{title:'Zahlung fehlgeschlagen',detail:'Diesen Vorgang nicht erneut übermitteln. Den gespeicherten Entwurf und den Kontobereich prüfen.'},
 canceled:{title:'Vorbereitung verworfen',detail:'Dieser Vorgang ist beendet. Er wird nicht erneut verwendet.'}
});
export const checkoutUuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function validCheckoutReference(ref,hash){
 if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).sort().join(',')!=='requestId,sessionHash,version'||ref.version!==1||!checkoutUuid(ref.requestId)||typeof ref.sessionHash!=='string'||!/^[0-9a-f]{64}$/.test(ref.sessionHash))throw Error('INVALID_CHECKOUT_REFERENCE');
 if(ref.sessionHash!==hash)throw Error('ACCOUNT_CHANGED');
 return ref;
}
export function draftCanPrepare(draft,now=Date.now()){
 return draft?.status==='draft'&&draft.expired===false&&Number.isFinite(Date.parse(draft.expiresAt))&&Date.parse(draft.expiresAt)>now;
}
