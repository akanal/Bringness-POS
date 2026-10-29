// Pure document numbering guard. No numbers are allocated here.
// The persistent allocator must enforce uniqueness transactionally.
export function validateShopDocumentNumber({companyId,kind,year,sequence,documentNumber}){
 if(typeof companyId!=='string'||!companyId.trim()||companyId.length>160)throw Error('SHOP_DOCUMENT_COMPANY_INVALID');
 if(!['invoice','credit_note'].includes(kind))throw Error('SHOP_DOCUMENT_KIND_INVALID');
 if(!Number.isSafeInteger(year)||year<2000||year>9999)throw Error('SHOP_DOCUMENT_YEAR_INVALID');
 if(!Number.isSafeInteger(sequence)||sequence<1||sequence>999999999)throw Error('SHOP_DOCUMENT_SEQUENCE_INVALID');
 const prefix=kind==='invoice'?'INV':'CRN';
 const expected=`${prefix}-${year}-${String(sequence).padStart(9,'0')}`;
 if(documentNumber!==expected)throw Error('SHOP_DOCUMENT_NUMBER_MISMATCH');
 return Object.freeze({companyId,kind,year,sequence,documentNumber});
}
