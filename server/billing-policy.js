// Restaurant replaces the base tariff. Tisch-QR remains a separate subscription.
export function billingPolicy({base=false,restaurant=false,tableQr=false,download=false}={}) {
  return {
    features:{pos_base:base||restaurant||download,restaurant,table_qr:restaurant&&tableQr},
    plans:{
      pos_base_monthly:{active:base,eligible:!base&&!restaurant&&!download,requires:[],included:restaurant||download},
      restaurant_monthly:{active:restaurant,eligible:!restaurant&&!download,requires:[]},
      table_qr_monthly:{active:restaurant&&tableQr,eligible:restaurant&&!tableQr&&!download,requires:['restaurant_monthly']},
      download_license:{active:download,eligible:!download&&!base&&!restaurant,requires:[]}
    }
  };
}
