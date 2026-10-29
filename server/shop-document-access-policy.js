// Isolated authorization policy; identity must come from authenticated server session.
export function authorizeShopDocumentAccess({actor,companyId,action}){
 if(!actor||typeof actor!=='object'||typeof actor.id!=='string'||!actor.id.trim()||actor.id.length>160)throw Error('SHOP_DOCUMENT_ACTOR_INVALID');
 if(typeof companyId!=='string'||!companyId.trim()||typeof actor.companyId!=='string'||actor.companyId!==companyId)throw Error('SHOP_DOCUMENT_COMPANY_FORBIDDEN');
 if(!['read','verify','export'].includes(action))throw Error('SHOP_DOCUMENT_ACTION_INVALID');
 const permissions={owner:['read','verify','export'],admin:['read','verify','export'],accountant:['read','verify','export'],staff:['read']};
 if(!Object.hasOwn(permissions,actor.role)||!permissions[actor.role].includes(action))throw Error('SHOP_DOCUMENT_ACCESS_FORBIDDEN');
 return Object.freeze({actorId:actor.id,companyId,action});
}
