// Shared policy: temporary transport/access failures must preserve replay identifiers.
export function permanentStockFailure(error){
 const status=error?.status;
 return Number.isInteger(status)&&status>=400&&status<500&&![401,403,408,425,429].includes(status);
}
export function stockBatchLimit(value=100){
 if(!Number.isInteger(value)||value<1||value>500)throw Object.assign(new Error('Lagerabgleich-Limit muss zwischen 1 und 500 liegen'),{status:400});
 return value;
}

export function stockFailureMessage(error){
 const message=typeof error?.message==='string'?error.message:typeof error==='string'?error:'';
 return message.trim().slice(0,500)||'Lagerabgleich vorübergehend nicht verfügbar';
}
