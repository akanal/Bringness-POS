// All optional modules require an active POS base licence.
// A paid download licence also grants base access; it is not a monthly subscription.
export function billingPolicy({base=false,tableQr=false,download=false,baseAccess=base}={}) {
  const hasBase=Boolean(baseAccess||base||download);
  const qrActive=hasBase&&tableQr;
  return {
    features:{pos_base:hasBase,table_qr:qrActive,table_management:qrActive},
    plans:{
      pos_base_monthly:{active:base,eligible:!base&&!download,requires:[],included:download},
      table_qr_monthly:{active:qrActive,eligible:hasBase&&!tableQr,requires:['pos_base','table_management_monthly']},
      table_management_monthly:{active:qrActive,eligible:false,requires:['table_qr_monthly'],mandatoryWith:'table_qr_monthly',monthlyNetCents:990},
      download_license:{active:download,eligible:!hasBase,requires:[]}
    }
  };
}
