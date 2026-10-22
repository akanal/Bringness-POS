import {fileURLToPath} from 'node:url';
import {lineDiscount} from './sale-discount.js';
import {receiptLines} from './receipt-lines.js';

// Dedicated A4 layout; thermal receipts keep their existing renderer.
export function renderTradeInvoice(doc, receipt, items, payments, qrBuffer) {
  doc.registerFont('TradeRegular',fileURLToPath(new URL('./assets/invoice-fonts/DejaVuSans.ttf',import.meta.url)));
  doc.registerFont('TradeBold',fileURLToPath(new URL('./assets/invoice-fonts/DejaVuSans-Bold.ttf',import.meta.url)));
  const money = cents => (Number(cents) / 100).toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' EUR';
  const date = new Date(receipt.issued_at).toLocaleDateString('de-DE', {timeZone:'Europe/Berlin'});
  const left=48, right=547, width=499, bottom=735;
  const seller=String(receipt.contact_name || receipt.billing_name || receipt.company_name || receipt.restaurant_name || '').replace(/^([\p{L}]+)\.([\p{L}]+)$/u,'$1 $2');
  const address=[receipt.street,[receipt.postal_code,receipt.city].filter(Boolean).join(' ')].filter(Boolean);
  const text=(value,x,y,w=width,size=10,bold=false,align='left')=>{
    doc.font(bold?'TradeBold':'TradeRegular').fontSize(size).fillColor('#222222').text(String(value??''),x,y,{width:w,align});
    return doc.y;
  };
  const footer=()=>{
    const previousBottom=doc.page.margins.bottom;doc.page.margins.bottom=20;
    doc.save().strokeColor('#b7b7b7').moveTo(left,764).lineTo(right,764).stroke().restore();
    const details=receipt.document_details||{};
    const columns=[[seller,...address],[details.phone&&'Tel. '+details.phone,details.email,details.taxNumber&&'Steuer-Nr.: '+details.taxNumber,receipt.vat_id&&'USt-IdNr.: '+receipt.vat_id],[details.bankName,details.iban&&'IBAN '+details.iban,details.bic&&'BIC '+details.bic]];
    columns.forEach((values,index)=>{doc.font('TradeRegular').fontSize(7).fillColor('#777777').text(values.filter(Boolean).join('\n'),left+index*170,774,{width:160,lineGap:2});});
    doc.page.margins.bottom=previousBottom;
  };
  const next=()=>{footer();doc.addPage();return 65;};
  const band=(y,label,amount,bold=false)=>{
    doc.save().fillColor('#e5e5e5').rect(left,y,width,23).fill().restore();
    text(label,left+8,y+6,330,10,bold);text(money(amount),390,y+6,149,10,bold,'right');
    return y+28;
  };
  const header=y=>{
    doc.save().fillColor('#dedede').rect(left,y,width,24).fill().restore();
    for(const [label,x,w,align] of [['Pos.',52,28,'left'],['Beschreibung',85,225,'left'],['Menge',315,50,'right'],['Einzelpreis¹',370,80,'right'],['Gesamtpreis',455,87,'right']])text(label,x,y+7,w,9,true,align);
    return y+30;
  };
  text('Rechnung',355,48,192,16,true,'right');
  text([seller,...address].join(' · '),57,114,250,7);
  // Folding marks: address stays in the window after folding an A4 sheet.
  doc.save().strokeColor('#bbbbbb').lineWidth(0.4);for(const fy of [297.64,595.28])doc.moveTo(10,fy).lineTo(20,fy).stroke();doc.restore();
  const recipient=receipt.recipient||{};
  const recipientText=[recipient.name,recipient.street,[recipient.postalCode,recipient.city].filter(Boolean).join(' '),recipient.country,recipient.vatId&&'USt-IdNr.: '+recipient.vatId,recipient.taxNumber&&'Steuer-Nr.: '+recipient.taxNumber,recipient.email,recipient.phone&&'Tel. '+recipient.phone].filter(Boolean).join('\n');
  let addressSize=10;doc.font('TradeRegular').fontSize(addressSize);while(addressSize>8&&doc.heightOfString(recipientText,{width:240})>78){addressSize-=0.5;doc.fontSize(addressSize);}
  const recipientY=text(recipientText,57,142,240,addressSize);
  let metaY=145;
  for(const [label,value] of [['Rechnungs-Nr.',receipt.receipt_number],['Rechnungsdatum',date],['Lieferdatum',date]]){
    text(label,355,metaY,100,9);metaY=text(value,455,metaY,92,9,false,'right')+6;
  }
  for(const value of [receipt.document_details?.taxNumber&&'Steuer-Nr.: '+receipt.document_details.taxNumber,receipt.vat_id&&'USt-IdNr.: '+receipt.vat_id].filter(Boolean))metaY=text(value,355,metaY,192,8)+6;
  let y=Math.max(250,recipientY+25,metaY+25);
  y=text('Rechnung Nr. '+receipt.receipt_number,left,y,width,16,true)+23;
  y=text('Sehr geehrte Damen und Herren,',left,y)+16;
  y=text('vielen Dank für Ihren Auftrag. Wir berechnen folgende Leistungen:',left,y)+18;
  y=header(y);
  const vat=new Map();let netTotal=0,grossTotal=0;
  items.forEach((item,index)=>{
    const quantity=Number(item.quantity),rate=Number(item.tax_rate_snapshot);
    const gross=Math.round(Number(item.unit_price_cents)*quantity)-lineDiscount(receipt.sale_adjustment,item.product_id);
    const net=Math.round(gross/(1+rate/100)),tax=gross-net;
    netTotal+=net;grossTotal+=gross;vat.set(rate,(vat.get(rate)||0)+tax);
  });
  const displayItems=receiptLines(items,receipt.sale_adjustment);
  displayItems.forEach((item,index)=>{
    const quantity=Number(item.quantity),rate=Number(item.tax_rate_snapshot),net=item.netCents;
    const name=String(item.product_name_snapshot||'');
    doc.font('TradeBold').fontSize(10);
    const rowHeight=Math.max(27,doc.heightOfString(name,{width:220})+12);
    if(y+rowHeight>bottom){y=next();y=header(y);}
    // Paint the entire row in the PDF itself, including printed output.
    doc.save().fillColor(index%2===0?'#ffffff':'#eeeeee').rect(left,y-5,width,rowHeight).fill().restore();
    text(index+1,52,y,28,10);text(name,85,y,220,10,true);
    text(quantity.toLocaleString('de-DE'),315,y,50,10,false,'right');
    // Extra unit precision avoids silently rounding a net unit price to whole cents.
    text((Number(item.unit_price_cents)/100/(item.mixedTax?1:1+rate/100)).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:4})+(item.mixedTax?' EUR²':' EUR'),370,y,80,9,false,'right');
    text(money(net),455,y,87,9,false,'right');
    y+=rowHeight;
  });
  const summaryHeight=105+vat.size*24+(receipt.sale_adjustment?28:0);
  if(y+summaryHeight>bottom)y=next();
  y+=8;
  y=band(y,'Gesamtbetrag netto',netTotal);
  for(const [rate,tax] of [...vat].sort((a,b)=>a[0]-b[0])){
    text('Umsatzsteuer '+rate.toLocaleString('de-DE')+' %',left+8,y+5,330);
    text(money(tax),390,y+5,149,10,false,'right');y+=24;
  }
  y=band(y,'Gesamtbetrag brutto',receipt.total_cents,true);
  y=text('¹ Preise netto; Positionssummen nach Rabatt auf Cent gerundet.'+(displayItems.some(item=>item.mixedTax)?' ² Bei gemischten Steuersätzen: Pfand-Einzelpreis brutto.':''),left,y+3,width,8)+8;
  if(receipt.sale_adjustment)y=text('Enthaltener Rabatt: '+money(receipt.sale_adjustment.discountCents),left,y,width,9)+8;
  if(grossTotal!==Number(receipt.total_cents))y=text('Hinweis: Positionssumme weicht vom Zahlbetrag ab.',left,y,width,9)+8;
  if(y+payments.length*18+145>bottom)y=next();
  for(const payment of payments){
    const label=({cash:'Barzahlung',card:'Karte',mollie_center:'Online-Zahlung'})[payment.method]||payment.method;
    y=text('Zahlungsart: '+label+' · '+money(payment.amount_cents),left,y,width,10)+5;
  }
  doc.image(qrBuffer,(doc.page.width-70)/2,y+10,{width:70,height:70});
  y=text('QR: Digitalen Beleg öffnen',left,y+84,width,8,false,'center')+10;
  if(receipt.fiscal_status!=='signed')text('Nicht TSE-signiert – kein fiskalisierter Kassenbeleg.',left,y,width,8);
  footer();
}
