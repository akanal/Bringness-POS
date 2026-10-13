// Restaurant replaces the base tariff. Tisch-QR remains a separate subscription.
export function billingPolicy({base=false,restaurant=false,tableQr=false,download=false,baseAccess=base}={}) {
  return {
    features:{pos_base:base||restaurant||download,restaurant,table_qr:(baseAccess||restaurant||download)&&tableQr},
    plans:{
      pos_base_monthly:{active:base,eligible:!base&&!restaurant&&!download,requires:[],included:restaurant||download},
      restaurant_monthly:{active:restaurant,eligible:!restaurant&&!download,requires:[]},
      table_qr_monthly:{active:(baseAccess||restaurant||download)&&tableQr,eligible:(baseAccess||restaurant||download)&&!tableQr,requires:['pos_base']},
      download_license:{active:download,eligible:!download&&!base&&!restaurant,requires:[]}
    }
  };
}
